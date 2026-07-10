// src/lib/seo/crawler/technicalEvaluator.js
// ─────────────────────────────────────────────────────────────────────────────
// The TEACHER: an independent technical-SEO EVALUATOR. It does NOT replace the
// report's technical findings. It runs the doctorfizz-site-crawler skill (the exact
// audit engine) over the RENDERED DOM, then grades the report: which of the report's
// technical claims a live audit confirms, which it could not reproduce, which are out
// of this audit's scope, and what significant issues the live audit found that the
// report did not list.
//
// Split into two steps so the slow crawl can overlap the rest of report generation:
//   runSiteAudit(opts)  -> slow Playwright crawl + audit, claims-independent, cached.
//   gradeReport(audit, reportTechnicalIssues) -> fast, pure, produces the verdict.
//   evaluateTechnical(opts) -> convenience that does both.
// Best-effort: returns null on failure so the report is never blocked.
// RULE 0: no em dashes or en dashes anywhere.
// ─────────────────────────────────────────────────────────────────────────────

import { createPlaywrightFetcher } from "./playwrightFetch.js";
import { crawlSite } from "./crawl.js";
import { runAudit, findingsToDicts } from "./audit.js";

const cleanDomain = (s) => String(s || "").trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/.*$/, "").toLowerCase();

// Canonical issue-type keys + a human label, so a report claim and a live audit finding
// compare even though phrased differently. Order matters (first match wins).
const KEY_PATTERNS = [
  ["missing_title", /missing (a )?<?title|no <?title|title.*missing/i, "Missing page titles"],
  ["multiple_title", /multiple <?title/i, "Multiple title tags"],
  ["title_outside_head", /<?title.*outside|outside.*head/i, "Title outside the head"],
  ["title_length", /title.*(over|below|length)|(over|below) \d+ (characters|pixels).*title/i, "Title length / pixel width"],
  ["missing_h1", /no h1|missing.*h1|h1.*missing/i, "Missing H1"],
  ["multiple_h1", /multiple h1/i, "Multiple H1s"],
  ["missing_meta_desc", /meta description|description.*missing|missing.*description/i, "Missing meta descriptions"],
  ["duplicate_title", /duplicate (meta )?title/i, "Duplicate titles"],
  ["missing_alt", /alt text|alt attribute|without alt|missing.*alt/i, "Images missing alt text"],
  ["image_size", /size attribute|width.*height|cls/i, "Images missing size attributes"],
  ["thin_content", /thin|low content/i, "Thin content pages"],
  ["duplicate_content", /exact duplicate|duplicate content|near duplicate/i, "Duplicate / near-duplicate content"],
  ["broken_link", /broken.*link/i, "Broken internal links"],
  ["mixed_content", /mixed content|insecure http/i, "Mixed content"],
  ["multiple_head", /multiple <?head/i, "Multiple head tags"],
  ["html_validity", /invalid.*head|missing head|missing body|elements in head|multiple <?body/i, "HTML head/body validity"],
  ["canonical", /canonical/i, "Canonical tags"],
  ["noindex", /noindex/i, "Noindex directives"],
  ["nofollow", /nofollow/i, "Nofollow directives"],
  ["redirect", /redirect/i, "Redirects"],
  ["sitemap", /sitemap/i, "XML sitemap"],
  ["schema", /schema|structured data|json-?ld/i, "Structured data / schema"],
  ["robots", /robots\.txt|blocked by robots/i, "robots.txt"],
  ["ssl", /ssl|https not|not https|http urls/i, "HTTPS / SSL"],
  ["security_header", /hsts|content-security|x-frame|x-content-type|security header/i, "Security headers"],
  ["url_hygiene", /uppercase|underscore|multiple slashes|contains a space|non ascii|parameters/i, "URL hygiene"],
  ["orphan", /orphan|zero internal inlinks|without internal outlinks/i, "Internal linking / orphans"],
  ["crawl_depth", /crawl depth/i, "Deep pages (crawl depth)"],
  ["hreflang", /hreflang|return link/i, "Hreflang"],
  ["lcp", /lcp|core web vitals|load time|page speed/i, "Page speed / Core Web Vitals"],
  ["homepage", /homepage.*reachable|not reachable|auth wall/i, "Homepage reachability"],
];
function canonicalKey(text) { const s = String(text || ""); for (const [key, re] of KEY_PATTERNS) if (re.test(s)) return key; return null; }
const keyLabel = (key) => (KEY_PATTERNS.find(([k]) => k === key) || [null, null, key])[2];

// Issue types the crawl audit genuinely evaluates. Claims about page speed, sitemap,
// schema, or homepage reachability come from other sources (PSI, sitemap fetch,
// validation), so the crawl grades them as out of scope, not as "could not reproduce".
const OUT_OF_SCOPE = new Set(["lcp", "sitemap", "schema", "homepage"]);

/**
 * SLOW step: crawl + audit the site over the rendered DOM. Claims-independent, cached.
 * @returns {Promise<object|null>} { engine, findings, pages_checked, html_pages, live_counts } or null
 */
export async function runSiteAudit(opts = {}) {
  const domain = cleanDomain(opts.domain || opts.startUrl);
  if (!domain) return null;
  const startUrl = opts.startUrl && /^https?:\/\//i.test(opts.startUrl) ? opts.startUrl : `https://${domain}`;
  const maxUrls = Number(opts.maxUrls || process.env.EVAL_MAX_URLS || 8);
  const useCache = opts.useCache !== false;
  const ttlDays = Number(opts.ttlDays || process.env.EVAL_CACHE_TTL_DAYS || 7);

  let cache = null;
  if (useCache) {
    try { cache = await import("../../cache/mongo.js"); } catch { cache = null; }
    if (cache && typeof cache.getCached === "function") {
      try { const hit = await cache.getCached({ domain, dataType: "tech-audit", ttlDays }); if (hit && Array.isArray(hit.findings)) return { ...hit, cached: true }; } catch { /* miss ok */ }
    }
  }

  const fetcher = await createPlaywrightFetcher({ proxyCountry: opts.proxyCountry || "" }).catch(() => null);
  if (!fetcher) return null;
  let records;
  try {
    // Overall hard cap: race the crawl against a wall-clock limit so runSiteAudit ALWAYS
    // resolves within it, no matter what (belt over the connect timeout + per-crawl deadline).
    // If it wins, res.crawled is 0 -> we return null; the finally closes the browser, which
    // cancels any in-flight crawl. This keeps the audit bounded so waiting for it in the
    // report can never approach the 300s limit.
    const hardMs = Number(opts.hardMs || process.env.EVAL_HARD_MS || 150000);
    const res = await Promise.race([
      crawlSite({
        startUrl, maxUrls, maxDepth: -1, workers: Number(opts.workers || process.env.EVAL_WORKERS || 4),
        respectRobots: opts.respectRobots !== false, crawlSubdomains: false,
        fetchPage: fetcher.fetchPage, fetchText: fetcher.fetchText,
        deadlineMs: Number(opts.deadlineMs || process.env.EVAL_DEADLINE_MS || 75000),
        onProgress: opts.onProgress || null,
      }),
      new Promise((resolve) => setTimeout(() => resolve({ records: [], crawled: 0, _timedOut: true }), hardMs)),
    ]);
    records = res.records;
    if (!res.crawled) return null;
  } catch (e) {
    try { console.warn("[technicalEvaluator] audit failed:", e && e.message); } catch { /* ignore */ }
    return null;
  } finally { await fetcher.close(); }

  const findings = findingsToDicts(runAudit(records));
  const liveCounts = { high: 0, medium: 0, low: 0 };
  for (const f of findings) liveCounts[f.priority] = (liveCounts[f.priority] || 0) + 1;
  const out = {
    engine: "playwright-technical-evaluator",
    findings,
    pages_checked: records.length,
    html_pages: records.filter((r) => r.is_html && r.status === 200).length,
    live_counts: liveCounts,
  };
  // If NOT ONE page rendered as live HTML, the crawler could not reach the site (e.g.
  // Browserless was unreachable), so every finding is a false "No Response". Discard it
  // rather than surface a misleading verdict, and do not cache the failure.
  if (!out.html_pages) return null;
  if (useCache && cache && typeof cache.putCached === "function" && findings.length) {
    try { await cache.putCached({ domain, dataType: "tech-audit", payload: out, source: "playwright-technical-evaluator", fetchedBy: opts.fetchedBy || "" }); } catch { /* non-fatal */ }
  }
  return out;
}

/**
 * FAST + PURE step: grade the report's technical claims against the audit.
 * @param {object} audit  the runSiteAudit() result
 * @param {Array}  reportTechnicalIssues  the report's technical_issues[]
 * @returns {object|null} the verdict
 */
export function gradeReport(audit, reportTechnicalIssues = []) {
  if (!audit || !Array.isArray(audit.findings)) return null;
  const findings = audit.findings;

  const rank = { high: 0, medium: 1, low: 2 };
  const liveByKey = new Map();
  for (const f of findings) {
    const key = canonicalKey(`${f.category} ${f.issue}`);
    if (!key) continue;
    if (!liveByKey.has(key)) liveByKey.set(key, { key, label: keyLabel(key), count: 0, worst: "low" });
    const e = liveByKey.get(key);
    e.count += 1;
    if (rank[f.priority] < rank[e.worst]) e.worst = f.priority;
  }

  const claims = Array.isArray(reportTechnicalIssues) ? reportTechnicalIssues : [];
  const claimKeys = new Map();
  for (const c of claims) {
    const key = canonicalKey(c.issue || c.title || "");
    if (!key) continue;
    if (!claimKeys.has(key)) claimKeys.set(key, { key, label: keyLabel(key) });
  }

  const confirmed = [], unconfirmed = [], outOfScope = [];
  for (const [key, v] of claimKeys.entries()) {
    if (OUT_OF_SCOPE.has(key)) { outOfScope.push({ key, label: v.label }); continue; }
    if (liveByKey.has(key)) confirmed.push({ key, label: v.label, live_count: liveByKey.get(key).count });
    else unconfirmed.push({ key, label: v.label });
  }
  const additional = [];
  for (const [key, e] of liveByKey.entries()) {
    if (claimKeys.has(key) || e.worst === "low") continue;
    additional.push({ key, label: e.label, count: e.count, priority: e.worst });
  }
  additional.sort((a, b) => (rank[a.priority] - rank[b.priority]) || (b.count - a.count));

  const inScopeCount = confirmed.length + unconfirmed.length;
  const highAdditional = additional.filter((a) => a.priority === "high").length;
  const accuracyPct = inScopeCount ? Math.round((confirmed.length / inScopeCount) * 100) : null;

  let grade;
  if (!inScopeCount && !additional.length) grade = "No on-page claims to verify";
  else if (unconfirmed.length === 0 && highAdditional === 0 && additional.length <= 2) grade = "Verified accurate";
  else if (unconfirmed.length === 0) grade = "Accurate but incomplete";
  else if (accuracyPct != null && accuracyPct >= 50) grade = "Mostly accurate";
  else grade = "Needs review";

  const parts = [`A live audit of ${audit.html_pages} rendered page(s)`];
  if (inScopeCount) parts.push(`confirmed ${confirmed.length} of ${inScopeCount} on-page issue type(s) the report claims`);
  if (unconfirmed.length) parts.push(`could not reproduce ${unconfirmed.length}`);
  if (additional.length) parts.push(`found ${additional.length} further issue type(s) the report did not list${highAdditional ? ` (${highAdditional} high priority)` : ""}`);
  if (!inScopeCount && !additional.length) parts.push(`found ${findings.length} technical findings`);
  const summary = parts.join(", ").replace(/, ([^,]*)$/, " and $1") + ".";

  return {
    engine: "playwright-technical-evaluator",
    pages_checked: audit.pages_checked,
    html_pages: audit.html_pages,
    live_findings_count: findings.length,
    live_counts: audit.live_counts,
    report_claim_types: claimKeys.size,
    on_page_claims: inScopeCount,
    confirmed, unconfirmed, out_of_scope: outOfScope, additional,
    accuracy_pct: accuracyPct,
    grade, summary,
  };
}

/** Convenience: crawl+audit then grade. */
export async function evaluateTechnical(opts = {}) {
  const audit = await runSiteAudit(opts);
  if (!audit) return null;
  return gradeReport(audit, opts.reportTechnicalIssues || []);
}

export default evaluateTechnical;
