// src/lib/seo/report-format.js
// ─────────────────────────────────────────────────────────────────────────────
// EVIDENCE-FIRST REPORT — Track 1 foundation.
//
// Shared formatting + standardization so every report number, metric name and
// recommendation is consistent, sourced, and evidence-structured:
//   • fmtNum / fmtInt / fmtPct / fmtRating — consistent rounding + K/M/B suffixes (#17)
//   • METRICS — canonical metric label + short code + DATA SOURCE per metric (#15, #16)
//   • CONFIDENCE / OWNERS / EFFORT / IMPACT — recommendation labels (#13, #18, #19, #20)
//   • toEvidenceRec() — normalize any recommendation into the evidence schema:
//       Finding · Evidence/Data · Competitor Benchmark · Action · Expected Impact ·
//       Validation Metric  (+ confidence / owner / effort / impact / sources)  (#1, #25)
//
// Pure + dependency-free so it's usable from the logic layer AND the React renderer.
// ─────────────────────────────────────────────────────────────────────────────

// ── #17 — number formatting ───────────────────────────────────────────────────
const _trim = (x) => String(x).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");

/** Compact number: 1248.77 → "1.25K", 3_400_000 → "3.4M", 42 → "42". */
export function fmtNum(v, { decimals = 2 } = {}) {
  if (v == null || v === "") return "—";
  const n = typeof v === "number" ? v : Number(String(v).replace(/[, ]/g, ""));
  if (!isFinite(n)) return String(v);
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1e9) return sign + _trim((abs / 1e9).toFixed(decimals)) + "B";
  if (abs >= 1e6) return sign + _trim((abs / 1e6).toFixed(decimals)) + "M";
  if (abs >= 1e3) return sign + _trim((abs / 1e3).toFixed(decimals)) + "K";
  if (abs > 0 && abs < 1) return sign + _trim(abs.toFixed(2)); // CLS-style small decimals
  return sign + Math.round(abs).toLocaleString("en-US");
}
/** Whole number with thousands separators, no suffix (good for ≤ 9,999 counts). */
export function fmtInt(v) {
  if (v == null || v === "") return "—";
  const n = Number(String(v).replace(/[, ]/g, ""));
  return isFinite(n) ? Math.round(n).toLocaleString("en-US") : String(v);
}
export function fmtPct(v, decimals = 0) {
  if (v == null || v === "") return "—";
  const n = Number(v);
  return isFinite(n) ? `${_trim(n.toFixed(decimals))}%` : String(v);
}
export function fmtRating(v) {
  if (v == null || v === "") return "—";
  const n = Number(v);
  return isFinite(n) ? `${_trim(n.toFixed(1))}★` : String(v);
}

// ── #15 / #16 — canonical metric terminology + data source ────────────────────
// Stop mixing "Domain Authority" / "Domain Rating" / "Authority Score", and clearly
// distinguish backlinks (total links) from referring domains (unique linking domains).
// `source` is the system the value comes from — surfaced next to every metric (#15).
export const METRICS = {
  domain_rating:             { label: "Domain Rating", short: "DR", source: "Moz", note: "0–100 link-authority score (not 'Domain Authority' or 'Authority Score')" },
  referring_domains:         { label: "Referring Domains", short: "Ref. Domains", source: "DataForSEO", note: "count of UNIQUE linking domains — not total backlinks" },
  backlinks:                 { label: "Backlinks", short: "Backlinks", source: "DataForSEO", note: "TOTAL inbound links — not unique domains" },
  organic_traffic:           { label: "Organic Traffic", short: "Traffic", source: "DataForSEO", note: "estimated monthly organic visits" },
  organic_keywords:          { label: "Organic Keywords", short: "Keywords", source: "DataForSEO", note: "keywords ranking in the top 100" },
  mobile_performance_score:  { label: "Mobile Performance", short: "Mobile", source: "Lighthouse" },
  desktop_performance_score: { label: "Desktop Performance", short: "Desktop", source: "Lighthouse" },
  lcp:                       { label: "LCP", short: "LCP", source: "Lighthouse", note: "Largest Contentful Paint" },
  cls:                       { label: "CLS", short: "CLS", source: "Lighthouse", note: "Cumulative Layout Shift" },
  site_health_score:         { label: "Site Health", short: "Health", source: "Doctor Fizz crawler" },
  gbp_completeness:          { label: "GBP Completeness", short: "GBP %", source: "GBP API" },
  gbp_review_count:          { label: "GBP Reviews", short: "Reviews", source: "GBP API" },
  gbp_rating:                { label: "GBP Rating", short: "Rating", source: "GBP API" },
  errors_404:                { label: "404 Errors", short: "404s", source: "Doctor Fizz crawler" },
  redirect_chains:           { label: "Redirect Chains", short: "Redirects", source: "Doctor Fizz crawler" },
};
export const metricLabel = (key) => METRICS[key]?.label || String(key || "").replace(/_/g, " ");
export const metricShort = (key) => METRICS[key]?.short || metricLabel(key);
export const metricSource = (key) => METRICS[key]?.source || "";
export const metricNote = (key) => METRICS[key]?.note || "";
/** "Domain Rating (Moz)" — label with its source for #15. */
export const metricWithSource = (key) => { const s = metricSource(key); return s ? `${metricLabel(key)} (${s})` : metricLabel(key); };

export const METRIC_SOURCES = ["DataForSEO", "Moz", "Lighthouse", "GBP API", "Doctor Fizz crawler", "Doctor Fizz GEO crawler"];

// ── #13 / #18 / #19 / #20 — recommendation labels ─────────────────────────────
export const CONFIDENCE = { HIGH: "High confidence", MEDIUM: "Medium confidence", EXPERIMENTAL: "Experimental" };
export const OWNERS = ["SEO", "Development", "Content", "Client"];
export const EFFORT_BANDS = ["Low", "Medium", "High"];
export const IMPACT_BANDS = ["Low", "Medium", "High"];

/** Map a recommendation's channel + text to the team that owns it (#18). */
export function ownerFromChannel(channel = "", text = "") {
  const t = `${channel} ${text}`.toLowerCase();
  if (/\b(dev|develop|technical|crawl|redirect|canonical|schema|speed|cwv|lcp|cls|robots|sitemap|h1|alt text|404|render|index|noindex)\b/.test(t)) return "Development";
  if (/\b(gbp|google business|review|nap|listing|citation|profile|q&a|q and a)\b/.test(t)) return "Client";
  if (/\b(content|blog|page|copy|article|title|meta|faq|guide|word count|topical)\b/.test(t)) return "Content";
  return "SEO";
}
/** Priority string → impact band (#20). */
export function impactFromPriority(p = "") {
  const u = String(p).toUpperCase();
  if (/CRITICAL|HIGH/.test(u)) return "High";
  if (/MEDIUM|QUICK\s*WIN/.test(u)) return "Medium";
  return "Low";
}
/** Effort string ("≈30 min" / "≈6–8 weeks") → effort band (#19). */
export function effortBand(effort = "") {
  const t = String(effort).toLowerCase();
  if (/\bmin\b|hour|quick/.test(t)) return "Low";
  if (/month/.test(t)) return "High";
  if (/week/.test(t)) return /([4-9]|1\d)\s*[–-]?\s*\d*\s*week/.test(t) ? "High" : "Medium";
  if (/\bday\b/.test(t)) return "Medium";
  return "Medium";
}

// ── #1 / #25 — evidence-based recommendation schema ───────────────────────────
// Normalize any raw recommendation object (action / technical issue / content page /
// backlink / GBP fix) into the canonical evidence structure. Maps the fields these
// builders already produce, then derives owner/effort/impact/confidence labels.
export function toEvidenceRec(raw = {}, extra = {}) {
  const priority = raw.priority || extra.priority || "MEDIUM";
  const effort = raw.effort || raw.estimated_effort || extra.effort || "";
  return {
    finding:              clean(raw.finding || raw.issue || raw.title || extra.finding || raw.description || ""),
    evidence:             clean(raw.evidence || raw.why_it_matters || raw.why || raw.commercial_reason || raw.reason || extra.evidence || ""),
    competitor_benchmark: clean(raw.competitor_benchmark || raw.benchmark || extra.competitor_benchmark || ""),
    action:               clean(raw.action || raw.recommended_action || raw.description || extra.action || ""),
    expected_impact:      clean(raw.expected_impact || raw.expected_unlock || raw.outcome || extra.expected_impact || ""),
    validation_metric:    clean(raw.validation_metric || raw.success_metric || extra.validation_metric || ""),
    confidence:           raw.confidence || extra.confidence || CONFIDENCE.MEDIUM,
    owner:                raw.owner || extra.owner || ownerFromChannel(raw.channel || extra.channel, [raw.issue, raw.finding, raw.action, raw.recommended_action, raw.description].filter(Boolean).join(" ")),
    effort,
    effort_band:          raw.effort_band || effortBand(effort),
    impact:               raw.impact_band || extra.impact || impactFromPriority(priority),
    priority,
    sources:              Array.isArray(raw.sources) ? raw.sources : (Array.isArray(extra.sources) ? extra.sources : []),
  };
}

function clean(s) { return String(s == null ? "" : s).trim().replace(/\s+/g, " "); }

export default { fmtNum, fmtInt, fmtPct, fmtRating, METRICS, metricLabel, metricWithSource, metricSource, toEvidenceRec };
