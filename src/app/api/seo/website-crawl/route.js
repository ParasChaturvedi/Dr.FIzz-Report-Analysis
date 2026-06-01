// src/app/api/seo/website-crawl/route.js
// Crawls a domain's sitemap, robots.txt, and top pages.
// Extracts: H1s, meta title/desc, index/noindex, image alts, schema JSON-LD, slug quality.

import { NextResponse } from "next/server";

export const runtime    = "nodejs";
export const maxDuration = 60;

const FETCH_TIMEOUT_MS  = 8000;
const MAX_PAGES_TO_CRAWL = 12;

// ── Tiny fetch wrapper with timeout ──────────────────────────────────────────
async function timedFetch(url, opts = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...opts,
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; DrFizz/1.0; +https://drfizz.com)",
        ...opts.headers,
      },
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// ── Normalise domain → hostname ───────────────────────────────────────────────
function normHost(input) {
  try {
    const s = String(input || "").trim();
    const u = s.includes("://") ? new URL(s) : new URL(`https://${s}`);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return String(input || "").replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  }
}

// ── Parse sitemap XML (index or urlset) and return up to N URLs ───────────────
function parseSitemapXml(xml, base, limit = MAX_PAGES_TO_CRAWL) {
  const urls = [];
  // Handle sitemap index → nested <loc> inside <sitemap> tags
  const locMatches = [...xml.matchAll(/<loc>\s*(https?:\/\/[^<]+)\s*<\/loc>/gi)];
  for (const m of locMatches) {
    const u = m[1].trim();
    // skip sitemap index entries (they're sub-sitemaps, not pages)
    if (u.endsWith(".xml")) continue;
    if (urls.length >= limit) break;
    urls.push(u);
  }
  // If we got nothing useful, try relative <loc> entries
  if (urls.length === 0) {
    const rel = [...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)];
    for (const m of rel) {
      const u = m[1].trim();
      if (u.startsWith("http") && !u.endsWith(".xml") && urls.length < limit) {
        urls.push(u);
      }
    }
  }
  return urls;
}

// ── Assess slug quality ───────────────────────────────────────────────────────
function assessSlug(urlStr) {
  try {
    const u = new URL(urlStr);
    const slug = u.pathname.replace(/\/$/, "");
    const issues = [];
    if (/[A-Z]/.test(slug))                         issues.push("uppercase letters");
    if (/[_]/.test(slug))                            issues.push("underscores (use hyphens)");
    if (/\?/.test(slug))                             issues.push("query params in slug");
    if (/\d{4,}/.test(slug))                         issues.push("numeric IDs");
    if (slug.split("/").some((s) => s.length > 60))  issues.push("segment too long (>60 chars)");
    if (/%[0-9a-f]{2}/i.test(slug))                  issues.push("URL-encoded characters");
    return {
      slug,
      score: issues.length === 0 ? "good" : issues.length <= 1 ? "fair" : "poor",
      issues,
    };
  } catch {
    return { slug: "", score: "unknown", issues: [] };
  }
}

// ── Extract text content from a tag using regex ───────────────────────────────
function matchFirst(html, pattern) {
  const m = html.match(pattern);
  return m ? m[1]?.trim() : null;
}

function matchAll(html, pattern) {
  return [...html.matchAll(pattern)].map((m) => m[1]?.trim()).filter(Boolean);
}

// ── Audit a single page's HTML ────────────────────────────────────────────────
function auditPage(url, html, keywords = []) {
  const kws = keywords.map((k) => String(k).toLowerCase());

  // Meta title
  const metaTitle = matchFirst(html, /<title[^>]*>([^<]{1,200})<\/title>/i) || null;

  // Meta description
  const metaDesc =
    matchFirst(html, /<meta\s[^>]*name=["']description["'][^>]*content=["']([^"']{1,400})["']/i) ||
    matchFirst(html, /<meta\s[^>]*content=["']([^"']{1,400})["'][^>]*name=["']description["']/i) ||
    null;

  // Robots meta (index/noindex)
  const robotsMeta =
    matchFirst(html, /<meta\s[^>]*name=["']robots["'][^>]*content=["']([^"']*)["']/i) ||
    matchFirst(html, /<meta\s[^>]*content=["']([^"']*)["'][^>]*name=["']robots["']/i) ||
    "index, follow";
  const isNoindex = /noindex/i.test(robotsMeta);

  // Canonical
  const canonical =
    matchFirst(html, /<link\s[^>]*rel=["']canonical["'][^>]*href=["']([^"']*)["']/i) ||
    matchFirst(html, /<link\s[^>]*href=["']([^"']*)["'][^>]*rel=["']canonical["']/i) ||
    null;

  // H1 tags
  const h1s = matchAll(html, /<h1[^>]*>([\s\S]*?)<\/h1>/gi)
    .map((h) => h.replace(/<[^>]+>/g, "").trim())
    .filter(Boolean);

  const h1HasKeyword = h1s.some((h) =>
    kws.some((k) => h.toLowerCase().includes(k))
  );

  // H2 count
  const h2Count = (html.match(/<h2[\s>]/gi) || []).length;

  // Images without alt tags
  const allImgTags = [...html.matchAll(/<img\s([^>]*)>/gi)].map((m) => m[1]);
  const imgsWithoutAlt = allImgTags.filter((attrs) => {
    const hasAlt = /alt=["'][^"']*["']/i.test(attrs);
    const emptyAlt = /alt=["']\s*["']/i.test(attrs);
    return !hasAlt || emptyAlt;
  }).length;

  // Schema JSON-LD
  const schemaBlocks = matchAll(
    html,
    /<script\s[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  );
  const schemaTypes = [];
  for (const block of schemaBlocks) {
    try {
      const obj = JSON.parse(block);
      const types = Array.isArray(obj) ? obj.map((o) => o["@type"]) : [obj["@type"]];
      schemaTypes.push(...types.filter(Boolean));
    } catch {
      const typeMatch = block.match(/"@type"\s*:\s*"([^"]+)"/);
      if (typeMatch) schemaTypes.push(typeMatch[1]);
    }
  }

  // Open Graph
  const ogTitle = matchFirst(html, /<meta\s[^>]*property=["']og:title["'][^>]*content=["']([^"']{1,200})["']/i) || null;
  const ogDesc  = matchFirst(html, /<meta\s[^>]*property=["']og:description["'][^>]*content=["']([^"']{1,400})["']/i) || null;

  // Issues
  const issues = [];
  if (!metaTitle)                   issues.push("Missing meta title");
  else if (metaTitle.length < 30)   issues.push("Meta title too short (<30 chars)");
  else if (metaTitle.length > 60)   issues.push("Meta title too long (>60 chars)");

  if (!metaDesc)                    issues.push("Missing meta description");
  else if (metaDesc.length < 50)    issues.push("Meta description too short (<50 chars)");
  else if (metaDesc.length > 160)   issues.push("Meta description too long (>160 chars)");

  if (h1s.length === 0)             issues.push("No H1 tag");
  else if (h1s.length > 1)          issues.push(`Multiple H1 tags (${h1s.length})`);

  if (kws.length > 0 && !h1HasKeyword) issues.push("H1 doesn't include target keyword");

  if (imgsWithoutAlt > 0)           issues.push(`${imgsWithoutAlt} image(s) missing alt text`);
  if (schemaTypes.length === 0)     issues.push("No structured data (Schema.org)");
  if (isNoindex)                    issues.push("Page is noindex — won't appear in search");

  const slugInfo = assessSlug(url);
  if (slugInfo.issues.length > 0)   issues.push(`Slug issues: ${slugInfo.issues.join(", ")}`);

  return {
    url,
    metaTitle,
    metaDesc,
    robotsMeta,
    isNoindex,
    canonical,
    h1s,
    h1HasKeyword,
    h2Count,
    imgsWithoutAlt,
    schemaTypes,
    ogTitle,
    ogDesc,
    slug: slugInfo,
    issues,
    issueCount: issues.length,
  };
}

// ── Fetch and crawl a single page ─────────────────────────────────────────────
async function crawlPage(url, keywords = []) {
  try {
    const res = await timedFetch(url);
    if (!res.ok) return { url, error: `HTTP ${res.status}`, issues: [] };
    const html = await res.text();
    return auditPage(url, html, keywords);
  } catch (err) {
    return { url, error: err?.message || "fetch failed", issues: [] };
  }
}

// ── Main crawl function ───────────────────────────────────────────────────────
export async function crawlDomain(domain, keywords = []) {
  const host = normHost(domain);
  const base = `https://${host}`;

  const result = {
    domain: host,
    hasSitemap: false,
    sitemapUrl: null,
    hasRobots: false,
    robotsContent: null,
    robotsDisallows: [],
    crawlBlockedByRobots: false,
    pageCount: 0,
    pages: [],
    summary: {
      pagesMissingMetaTitle: 0,
      pagesMissingMetaDesc: 0,
      pagesMissingH1: 0,
      pagesNoindex: 0,
      pagesWithSchemaTypes: [],
      totalImgsWithoutAlt: 0,
      slugIssuesCount: 0,
      commonIssues: [],
    },
  };

  // ── 1. Fetch robots.txt ───────────────────────────────────────────────────
  try {
    const robotsRes = await timedFetch(`${base}/robots.txt`);
    if (robotsRes.ok) {
      const text = await robotsRes.text();
      result.hasRobots = true;
      result.robotsContent = text.slice(0, 2000);
      result.robotsDisallows = [...text.matchAll(/^Disallow:\s*(.+)$/gm)].map((m) => m[1].trim());
      // Check if crawlers are blocked
      if (/^User-agent:\s*\*[\s\S]*?Disallow:\s*\/(?:\s|$)/m.test(text)) {
        result.crawlBlockedByRobots = true;
      }
      // Extract sitemap URL from robots.txt if present
      const sitemapFromRobots = text.match(/^Sitemap:\s*(https?:\/\/\S+)/im);
      if (sitemapFromRobots) result.sitemapUrl = sitemapFromRobots[1].trim();
    }
  } catch (_) {/* ignore */}

  // ── 2. Fetch sitemap ──────────────────────────────────────────────────────
  const sitemapCandidates = [
    result.sitemapUrl,
    `${base}/sitemap.xml`,
    `${base}/sitemap_index.xml`,
    `${base}/sitemap/sitemap.xml`,
    `${base}/wp-sitemap.xml`,
  ].filter(Boolean);

  let sitemapUrls = [];
  for (const candidate of sitemapCandidates) {
    try {
      const res = await timedFetch(candidate);
      if (res.ok) {
        const xml = await res.text();
        if (xml.includes("<url") || xml.includes("<sitemap")) {
          result.hasSitemap = true;
          result.sitemapUrl = candidate;
          sitemapUrls = parseSitemapXml(xml, base);
          break;
        }
      }
    } catch (_) {/* try next */}
  }

  // ── 3. Always include homepage ────────────────────────────────────────────
  const pagesToCrawl = [base, ...sitemapUrls.filter((u) => u !== base)].slice(0, MAX_PAGES_TO_CRAWL);

  // ── 4. Crawl pages with limited concurrency ───────────────────────────────
  const CONCURRENCY = 3;
  const pages = [];
  for (let i = 0; i < pagesToCrawl.length; i += CONCURRENCY) {
    const batch = pagesToCrawl.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map((url) => crawlPage(url, keywords)));
    pages.push(...results);
  }

  result.pages = pages;
  result.pageCount = pages.length;

  // ── 5. Build summary ──────────────────────────────────────────────────────
  const allSchemaTypes = new Set();
  const issueFreq = {};

  for (const page of pages) {
    if (!page.metaTitle)     result.summary.pagesMissingMetaTitle++;
    if (!page.metaDesc)      result.summary.pagesMissingMetaDesc++;
    if ((page.h1s || []).length === 0) result.summary.pagesMissingH1++;
    if (page.isNoindex)      result.summary.pagesNoindex++;
    result.summary.totalImgsWithoutAlt += page.imgsWithoutAlt || 0;
    if ((page.slug?.issues || []).length > 0) result.summary.slugIssuesCount++;
    (page.schemaTypes || []).forEach((t) => allSchemaTypes.add(t));
    for (const issue of page.issues || []) {
      const key = issue.replace(/\d+/g, "N"); // normalise numbers
      issueFreq[key] = (issueFreq[key] || 0) + 1;
    }
  }

  result.summary.pagesWithSchemaTypes = [...allSchemaTypes];
  result.summary.commonIssues = Object.entries(issueFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([issue, count]) => ({ issue, count }));

  return result;
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function POST(request) {
  try {
    const body = await request.json();
    const { domain, keywords = [] } = body;

    if (!domain) {
      return NextResponse.json({ error: "domain is required" }, { status: 400 });
    }

    const result = await crawlDomain(domain, keywords);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[website-crawl] Error:", err);
    return NextResponse.json({ error: err?.message || "crawl failed" }, { status: 500 });
  }
}
