// src/lib/seo/jobs/scan-opportunities.js
import {
  discoverOpportunitiesUrls,
  normalizeToHttps,
  getHostname,
} from "@/lib/seo/discovery";
import {
  createScan,
  completeScan,
  failScan,
  upsertOpportunitiesSnapshot,
} from "@/lib/seo/snapshots.store";

import { checkPlagiarismWithPerplexity } from "@/lib/perplexity/pipeline";

// ✅ Use Browserless-rendered HTML + Readability main-content extraction
import {
  fetchHtml,
  extractTitle,
  extractMetaDescription,
  extractMainContentHtml,
} from "@/lib/seo/extraction";

/**
 * In-flight dedupe (module-level, survives within a single Node process).
 * Keyed by hostname + allowSubdomains + mode.
 */
const IN_FLIGHT = new Map();

function makeInFlightKey({ hostname, allowSubdomains, mode }) {
  return `opportunities|${hostname}|sub=${allowSubdomains ? 1 : 0}|mode=${mode}`;
}

function clampPct(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(100, Math.round(x)));
}

function htmlToPlain(html) {
  const s = String(html || "");
  if (!s) return "";
  return s
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * ✅ Heuristic for "blog-like" urls when blogUrls are missing.
 */
function isBlogOrArticleLikeUrl(url) {
  try {
    const u = new URL(url);
    const p = (u.pathname || "").toLowerCase();

    if (
      /\/(blog|blogs)\b/.test(p) ||
      /\/(article|articles)\b/.test(p) ||
      /\/(news|press)\b/.test(p) ||
      /\/(insights|resources|stories|updates)\b/.test(p) ||
      /\/(posts)\b/.test(p)
    ) {
      return true;
    }

    if (u.searchParams.has("p") || u.searchParams.has("post_type")) return true;

    return false;
  } catch {
    return false;
  }
}

/**
 * If a title is empty/missing, generate a nicer fallback from the slug.
 */
function titleFromSlug(url) {
  try {
    const u = new URL(url);
    const parts = (u.pathname || "")
      .split("/")
      .map((s) => s.trim())
      .filter(Boolean);

    if (!parts.length) return "";

    let slug = parts[parts.length - 1].replace(/\.[a-z0-9]+$/i, "");
    slug = slug.replace(/[-_]+/g, " ").trim();
    if (!slug) return "";

    return slug
      .split(" ")
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
      .join(" ");
  } catch {
    return "";
  }
}

function toNumber(val) {
  if (typeof val === "number") return Number.isFinite(val) ? val : null;
  if (typeof val === "string") {
    const cleaned = val.replace(/,/g, "").trim();
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function estimateWordCountFromText(text) {
  const t = String(text || "").trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

/**
 * ✅ Make HTML "editor-safe" AND "image-free" (same rules you use elsewhere)
 */
function sanitizeHtmlForEditor(inputHtml) {
  let html = String(inputHtml || "");
  if (!html) return "";

  // Drop very noisy/unsafe blocks
  html = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<svg[\s\S]*?<\/svg>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<canvas[\s\S]*?<\/canvas>/gi, "")
    .replace(/<form[\s\S]*?<\/form>/gi, "");

  // Remove HTML comments
  html = html.replace(/<!--[\s\S]*?-->/g, "");

  // Remove header/nav/footer/aside that often pollutes imports (best-effort)
  html = html
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<aside[\s\S]*?<\/aside>/gi, "");

  // ✅ REMOVE IMAGES & MEDIA COMPLETELY
  html = html
    .replace(/<figure[\s\S]*?<\/figure>/gi, "")
    .replace(/<picture[\s\S]*?<\/picture>/gi, "")
    .replace(/<img\b[^>]*>/gi, "")
    .replace(/<source\b[^>]*>/gi, "")
    .replace(/<video[\s\S]*?<\/video>/gi, "")
    .replace(/<audio[\s\S]*?<\/audio>/gi, "");

  // Strip attributes we don’t want
  html = html
    .replace(/\son\w+\s*=\s*["'][\s\S]*?["']/gi, "")
    .replace(/\sstyle\s*=\s*["'][\s\S]*?["']/gi, "");

  // For <a>: keep href, title, target, rel
  html = html.replace(/<a\b([^>]*)>/gi, (m, attrs) => {
    const href = (attrs.match(/\shref\s*=\s*["'][^"']*["']/i) || [])[0] || "";
    const title =
      (attrs.match(/\stitle\s*=\s*["'][^"']*["']/i) || [])[0] || "";
    const target =
      (attrs.match(/\starget\s*=\s*["'][^"']*["']/i) || [])[0] || "";
    const rel = (attrs.match(/\srel\s*=\s*["'][^"']*["']/i) || [])[0] || "";
    return `<a${href}${title}${target}${rel}>`;
  });

  // Allowed tags
  const allowed = new Set([
    "p",
    "br",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "s",
    "blockquote",
    "code",
    "pre",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "ul",
    "ol",
    "li",
    "hr",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
    "a",
    "span",
    "div",
  ]);

  html = html.replace(/<([a-z0-9]+)\b([^>]*)>/gi, (m, tag, attrs) => {
    const t = String(tag).toLowerCase();
    if (t === "a") return m;

    if (!allowed.has(t)) return `<div>`;

    if (t === "table") {
      const border =
        (attrs.match(/\sborder\s*=\s*["'][^"']*["']/i) || [])[0] || "";
      const cellpadding =
        (attrs.match(/\scellpadding\s*=\s*["'][^"']*["']/i) || [])[0] || "";
      const cellspacing =
        (attrs.match(/\scellspacing\s*=\s*["'][^"']*["']/i) || [])[0] || "";
      return `<table${border}${cellpadding}${cellspacing}>`;
    }

    return `<${t}>`;
  });

  // Clean up empty blocks
  html = html
    .replace(/<p>\s*(?:&nbsp;|\s|<br\s*\/?>)*\s*<\/p>/gi, "")
    .replace(/<div>\s*(?:&nbsp;|\s|<br\s*\/?>)*\s*<\/div>/gi, "");

  html = html.replace(/\n{3,}/g, "\n\n").trim();

  // keep it bounded for snapshot store
  if (html.length > 140_000) html = html.slice(0, 140_000);

  return html;
}

function extractBodyInnerHtml(fullHtml) {
  const html = String(fullHtml || "");
  if (!html) return "";
  const m = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return m ? m[1] : html;
}

/**
 * ✅ Select "best" URLs: prioritize richer content.
 * Default: sort by wordCount desc; tie-breaker: shorter url path (often cleaner canonical pages)
 */
function selectTopN(items, n = 2) {
  const list = Array.isArray(items) ? items.slice() : [];
  list.sort((a, b) => {
    const aw = toNumber(a?.wordCount) ?? 0;
    const bw = toNumber(b?.wordCount) ?? 0;
    if (bw !== aw) return bw - aw;
    return String(a?.url || "").length - String(b?.url || "").length;
  });
  return list.slice(0, n);
}

export function enqueueOpportunitiesScan({
  websiteUrl,
  allowSubdomains = false,
} = {}) {
  const normalized = normalizeToHttps(websiteUrl);
  const hostname = getHostname(normalized);
  if (!normalized || !hostname) throw new Error("Invalid websiteUrl");

  const mode = "published";
  const key = makeInFlightKey({ hostname, allowSubdomains, mode });

  const existing = IN_FLIGHT.get(key);
  if (
    existing?.scanId &&
    (existing.status === "queued" || existing.status === "running")
  ) {
    return existing;
  }

  const scan = createScan({
    kind: "opportunities",
    websiteUrl: normalized,
    hostname,
    allowSubdomains,
    mode,
  });

  upsertOpportunitiesSnapshot(hostname, {
    scanId: scan.scanId,
    status: "queued",
    mode,
    allowSubdomains,
    diagnostics: { stage: "queued" },
    blogs: [],
    pages: [],
  });

  IN_FLIGHT.set(key, { ...scan, status: "queued" });

  runOpportunitiesScan({
    inFlightKey: key,
    scanId: scan.scanId,
    websiteUrl: normalized,
    allowSubdomains,
    mode,
  }).catch(() => {});

  return scan;
}

async function runOpportunitiesScan({
  inFlightKey,
  scanId,
  websiteUrl,
  allowSubdomains,
  mode,
}) {
  const hostname = getHostname(websiteUrl);

  try {
    upsertOpportunitiesSnapshot(hostname, {
      scanId,
      status: "running",
      mode,
      allowSubdomains,
      diagnostics: { stage: "discovery" },
      blogs: [],
      pages: [],
    });
    IN_FLIGHT.set(inFlightKey, { scanId, status: "running" });
  } catch {}

  try {
    const discovery = await discoverOpportunitiesUrls({
      websiteUrl,
      allowSubdomains,
      crawlFallbackFn: simpleCrawlFallback,
    });

    let blogUrls = Array.isArray(discovery?.blogUrls) ? discovery.blogUrls : [];
    let pageUrls = Array.isArray(discovery?.pageUrls) ? discovery.pageUrls : [];

    const blogWasEmpty = blogUrls.length === 0;

    if (blogUrls.length === 0 && pageUrls.length > 0) {
      const inferredBlogs = pageUrls.filter(isBlogOrArticleLikeUrl);
      if (inferredBlogs.length > 0) blogUrls = inferredBlogs;
    }

    if (blogUrls.length === 0) {
      const crawled = await simpleCrawlFallback(hostname, {
        maxCrawlPages: 80,
        allowSubdomains,
      });

      const crawledBlogs = crawled.filter(isBlogOrArticleLikeUrl);
      if (crawledBlogs.length > 0) blogUrls = crawledBlogs.slice(0, 40);

      if (!pageUrls.length && crawled.length) {
        pageUrls = crawled.filter((u) => !isBlogOrArticleLikeUrl(u)).slice(0, 40);
      }
    }

    try {
      upsertOpportunitiesSnapshot(hostname, {
        scanId,
        status: "running",
        mode,
        allowSubdomains,
        diagnostics: {
          ...(discovery?.diagnostics || {}),
          stage: "fetch-main-content",
          blogFallbackUsed: blogWasEmpty && blogUrls.length > 0,
        },
        blogs: [],
        pages: [],
      });
    } catch {}

    // ---- bounded plagiarism budget for the scan ----
    const PLAGIARISM_MAX_ITEMS = 12; // tune this
    let plagiarismBudgetRemaining = PLAGIARISM_MAX_ITEMS;

    const budgetApi = {
      getBudget: () => plagiarismBudgetRemaining,
      consumeBudget: () =>
        (plagiarismBudgetRemaining = Math.max(0, plagiarismBudgetRemaining - 1)),
    };

    // ✅ Cap discovered URLs before expensive extraction
    blogUrls = (blogUrls || []).slice(0, 24);
    pageUrls = (pageUrls || []).slice(0, 24);

    // Fetch meta for candidates
    const blogMetaAll = await fetchManyMeta(
      blogUrls,
      hostname,
      allowSubdomains,
      budgetApi
    );
    const pageMetaAll = await fetchManyMeta(
      pageUrls,
      hostname,
      allowSubdomains,
      budgetApi
    );

    // ✅ store ONLY the “best 2 blogs + best 2 pages”
    const blogMeta = selectTopN(blogMetaAll, 2);
    const pageMeta = selectTopN(pageMetaAll, 2);

    upsertOpportunitiesSnapshot(hostname, {
      scanId,
      status: "complete",
      diagnostics: {
        ...(discovery?.diagnostics || {}),
        blogFallbackUsed: blogWasEmpty && blogUrls.length > 0,
        selected: {
          blogs: blogMeta.length,
          pages: pageMeta.length,
        },
      },
      mode,
      allowSubdomains,
      blogs: blogMeta,
      pages: pageMeta,
    });

    completeScan(scanId, { hostname, diagnostics: discovery?.diagnostics });
    IN_FLIGHT.set(inFlightKey, { scanId, status: "complete" });

    setTimeout(() => IN_FLIGHT.delete(inFlightKey), 30_000).unref?.();
  } catch (err) {
    try {
      upsertOpportunitiesSnapshot(hostname, {
        scanId,
        status: "failed",
        mode,
        allowSubdomains,
        diagnostics: { error: err?.message || "scan failed", stage: "failed" },
        blogs: [],
        pages: [],
      });
    } catch {}

    failScan(scanId, { error: err?.message || "scan failed" });
    IN_FLIGHT.set(inFlightKey, { scanId, status: "failed" });

    setTimeout(() => IN_FLIGHT.delete(inFlightKey), 30_000).unref?.();
  }
}

// ---------------------------
// Minimal controlled crawl fallback
// ---------------------------
async function simpleCrawlFallback(
  hostname,
  { maxCrawlPages = 60, allowSubdomains = false } = {}
) {
  const seed = `https://${hostname}/`;
  const visited = new Set();
  const queue = [seed];
  const results = [];

  while (queue.length && visited.size < maxCrawlPages) {
    const url = queue.shift();
    if (!url || visited.has(url)) continue;
    visited.add(url);

    const res = await safeFetch(url, { timeoutMs: 12000 });
    if (!res?.ok) continue;

    const html = await res.text().catch(() => "");
    if (!html) continue;

    results.push(url);

    const links = extractLinks(html, url);
    for (const link of links) {
      if (!link) continue;
      if (visited.has(link)) continue;

      try {
        const h = new URL(link).hostname.replace(/^www\./, "").toLowerCase();
        if (h !== hostname && !(allowSubdomains && h.endsWith(`.${hostname}`)))
          continue;
      } catch {
        continue;
      }

      queue.push(link);
      if (queue.length > maxCrawlPages * 4) break;
    }
  }

  return results;
}

function extractLinks(html, baseUrl) {
  const out = [];
  const matches = html.matchAll(/href\s*=\s*["']([^"']+)["']/gi);
  for (const m of matches) {
    const href = (m[1] || "").trim();
    if (!href) continue;
    if (
      href.startsWith("#") ||
      href.startsWith("mailto:") ||
      href.startsWith("tel:") ||
      href.startsWith("javascript:")
    )
      continue;

    try {
      out.push(new URL(href, baseUrl).toString());
    } catch {}
  }
  return out;
}

// ---------------------------
// Fetch + meta extraction
// ---------------------------

// ✅ Replace fetchManyMeta with a bounded concurrent pool
async function fetchManyMeta(urls, hostname, allowSubdomains, plagiarismBudgetApi) {
  const uniq = Array.from(new Set((urls || []).filter(Boolean)));

  // ✅ HARD CAP: do not scan unlimited URLs
  // (Tune these numbers. This alone prevents “scan takes forever”.)
  const CAPPED = uniq.slice(0, 18);

  const metas = [];
  const CONCURRENCY = 4;

  let idx = 0;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (idx < CAPPED.length) {
      const myIdx = idx++;
      const u = CAPPED[myIdx];

      try {
        const meta = await fetchMeta(u, hostname, allowSubdomains, plagiarismBudgetApi);
        if (meta) metas.push(meta);
      } catch {
        // swallow per-url errors; scan must finish
      }
    }
  });

  await Promise.all(workers);

  // de-dupe by final url
  const seen = new Set();
  return metas.filter((m) => {
    if (!m?.url) return false;
    if (seen.has(m.url)) return false;
    seen.add(m.url);
    return true;
  });
}

/**
 * ✅ KEY CHANGE:
 * - Use Browserless-rendered HTML (fetchHtml) when possible
 * - Extract MAIN CONTENT via Readability (extractMainContentHtml)
 * - Sanitize to editor-safe + image-free
 * - Title prefers Readability title, then <title>, then slug
 */
async function fetchMeta(url, hostname, allowSubdomains, plagiarismBudgetApi) {
  // host gate
  try {
    const h = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    if (h !== hostname && !(allowSubdomains && h.endsWith(`.${hostname}`)))
      return null;
  } catch {
    return null;
  }

  let fullHtml = "";
  let fetchedOk = false;

  // 1) Prefer Browserless-rendered HTML (best for JS sites)
  try {
    const fetched = await fetchHtml(url);
    fullHtml = String(fetched?.html || "");
    fetchedOk = Boolean(fullHtml);
  } catch {
    fetchedOk = false;
    fullHtml = "";
  }

  // 2) Fallback to direct fetch (cheap)
  if (!fetchedOk) {
    const res = await safeFetch(url, { timeoutMs: 15000 });
    if (!res || !res.ok) return null;
    fullHtml = await res.text().catch(() => "");
    if (!fullHtml) return null;
  }

  // Titles + description from full doc
  const docTitle = extractTitle(fullHtml) || "";
  const description = extractMetaDescription(fullHtml) || "";

  // ✅ MAIN CONTENT via Readability
  const main = extractMainContentHtml(fullHtml, url);

  const mainTitle = String(main?.title || "").trim();
  const mainHtml = String(main?.contentHtml || "").trim();
  const mainText = String(main?.text || "").trim();

  // If Readability fails, fallback to body inner html
  const fallbackBody = extractBodyInnerHtml(fullHtml);
  const htmlCandidate = mainHtml || fallbackBody || "";

  // ✅ sanitize final HTML that we store for editor hydration
  const contentHtml = sanitizeHtmlForEditor(htmlCandidate);

  // Word count: prefer readability text, else estimate from contentHtml
  let wordCount = estimateWordCountFromText(mainText);
  if (!wordCount && contentHtml) {
    wordCount = estimateWordCountFromText(htmlToPlain(contentHtml));
  }

  // Title: readability title -> <title> -> slug -> url
  const title = mainTitle || docTitle || titleFromSlug(url) || url;

  // ---- Precompute plagiarism (bounded) ----
  let plagiarism = 0;
  let plagiarismCheckedAt = null;
  let plagiarismSources = [];

  const budgetLeft = plagiarismBudgetApi?.getBudget?.() ?? 0;
  const shouldCheck =
    budgetLeft > 0 && wordCount >= 200 && contentHtml && contentHtml.length >= 1200;

  if (shouldCheck) {
    try {
      plagiarismBudgetApi?.consumeBudget?.();

      const draftText = htmlToPlain(contentHtml).slice(0, 9000);

      const out = await checkPlagiarismWithPerplexity({
        url,
        sourceUrl: url,
        draftText,
        sourceText: "",
        cacheKey: "",
      });

      plagiarism = clampPct(out?.plagiarism);
      plagiarismCheckedAt = out?.checkedAt || new Date().toISOString();
      plagiarismSources = Array.isArray(out?.sources) ? out.sources : [];
    } catch {
      // swallow plagiarism errors; keep scan resilient
    }
  }

  return {
    url,
    title,
    description,
    wordCount,
    contentHtml, // ✅ this is now MAIN CONTENT only (sanitized)
    isDraft: false,

    plagiarism,
    plagiarismCheckedAt,
    plagiarismSources,
  };
}

// ---------------------------
// Fetch with timeout (fallback only)
// ---------------------------
async function safeFetch(url, { timeoutMs = 12000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "user-agent": "DoctorFizzBot/1.0 (+https://example.com)",
        accept: "text/html,application/xhtml+xml",
      },
    });
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
