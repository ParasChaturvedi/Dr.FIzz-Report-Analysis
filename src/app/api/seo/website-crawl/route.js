// src/app/api/seo/website-crawl/route.js
// Advanced domain crawler — v2
// Extracts: H1-H6 hierarchy, meta signals, schema depth, internal link graph,
// duplicate detection, Core Web Vitals hints, social meta, SERP preview,
// content quality, page speed hints, E-E-A-T signals, overall health score.

import { getOrFetch } from "@/lib/cache/mongo";
import { logUsage } from "@/lib/cache/usage";
import { CRAWL_ENGINE_VERSION } from "@/lib/crawl/engineVersion";

export const runtime    = "nodejs";
export const maxDuration = 300;   // Vercel Pro ceiling

const FETCH_TIMEOUT_MS  = 10000;
const MAX_PAGES         = 300;    // upper bound on pages we deep-audit (HTML parsed) —
                                  // covers a full crawl for the vast majority of sites
const SITEMAP_SCAN_CAP  = 5000;   // sitemap URLs we count for the total estimate
const CONCURRENCY       = 8;      // parallel page fetches (fast but polite to the target)
// In the Vercel route this stays 140s (room for post-processing under maxDuration=300).
// The VPS crawl worker has no 300s cap, so it sets CRAWL_BUDGET_MS high (e.g. 600000) to
// render + audit a FULL site. Env override only; default is byte-identical to before.
const CRAWL_BUDGET_MS   = Number(process.env.CRAWL_BUDGET_MS) || 140000; // stop crawling new pages after this, leaving room for
                                  // post-processing within maxDuration — so most sites are
                                  // crawled FULLY and huge sites stop gracefully, never time out.

// ── DataForSEO: total indexed pages via `site:domain` ─────────────────────────
function dfsAuth() {
  const login    = process.env.DATAFORSEO_LOGIN    || "";
  const password = process.env.DATAFORSEO_PASSWORD || "";
  if (!login || !password) return null;
  return "Basic " + Buffer.from(`${login}:${password}`).toString("base64");
}

// Returns the approximate number of pages Google has indexed for the domain,
// using a `site:domain` SERP query — exactly what `site:itzfizz.com` shows.
async function fetchIndexedPageCount(host) {
  const auth = dfsAuth();
  if (!auth) return null;
  try {
    const res = await fetch("https://api.dataforseo.com/v3/serp/google/organic/live/advanced", {
      method:  "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body:    JSON.stringify([{
        keyword:       `site:${host}`,
        location_name: "India",
        language_code: "en",
        device:        "desktop",
        depth:         10,
      }]),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const result = data?.tasks?.[0]?.result?.[0];
    // se_results_count = Google's reported total for the query
    const total = result?.se_results_count ?? null;
    return total != null ? Number(total) : null;
  } catch (err) {
    console.warn("[website-crawl] indexed count failed:", err?.message);
    return null;
  }
}

// ── Timed fetch ───────────────────────────────────────────────────────────────
async function timedFetch(url, opts = {}) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeout || FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...opts,
      signal: ctrl.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; DrFizz/2.0; +https://drfizz.com)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        ...opts.headers,
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

// ── Domain normalisation ──────────────────────────────────────────────────────
function normHost(input) {
  try {
    const s = String(input || "").trim();
    const u = s.includes("://") ? new URL(s) : new URL(`https://${s}`);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return String(input || "").replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  }
}

// ── Regex helpers ─────────────────────────────────────────────────────────────
const first  = (html, re)  => { const m = html.match(re); return m?.[1]?.trim() || null; };
const all    = (html, re)  => [...html.matchAll(re)].map(m => m[1]?.trim()).filter(Boolean);
const count  = (html, re)  => (html.match(re) || []).length;

// ── Parse sitemap XML → page URLs (also returns the TOTAL count, uncapped) ─────
function parseSitemapXml(xml, limit = MAX_PAGES) {
  const urls = [];
  let total = 0;
  for (const m of xml.matchAll(/<loc>\s*(https?:\/\/[^<]+)\s*<\/loc>/gi)) {
    const u = m[1].trim();
    if (u.endsWith(".xml")) continue;
    total++;
    if (urls.length < limit) urls.push(u);
  }
  urls.total = total; // attach total for callers that want the real page count
  return urls;
}

// ── Fetch sub-sitemaps from sitemap index ─────────────────────────────────────
async function expandSitemapIndex(xml, base, limit = MAX_PAGES) {
  // Find child sitemap URLs
  const childSitemaps = [];
  for (const m of xml.matchAll(/<loc>\s*(https?:\/\/[^<]+\.xml)\s*<\/loc>/gi)) {
    childSitemaps.push(m[1].trim());
  }

  if (!childSitemaps.length) return parseSitemapXml(xml, limit);

  const urls = [];
  let total = 0;
  // Scan more child sitemaps (up to 10) to get a realistic total page estimate,
  // but only KEEP up to `limit` URLs for the deep audit.
  for (const sm of childSitemaps.slice(0, 10)) {
    try {
      const r = await timedFetch(sm);
      if (r.ok) {
        const txt = await r.text();
        const found = parseSitemapXml(txt, Math.max(0, limit - urls.length));
        total += found.total || found.length;
        for (const u of found) if (urls.length < limit) urls.push(u);
      }
    } catch { /* next */ }
  }
  const out = urls.slice(0, limit);
  out.total = total;
  return out;
}

// ── Slug quality ──────────────────────────────────────────────────────────────
function slugQuality(urlStr) {
  try {
    const slug = new URL(urlStr).pathname.replace(/\/$/, "");
    const issues = [];
    if (/[A-Z]/.test(slug))                          issues.push("uppercase");
    if (/[_]/.test(slug))                            issues.push("underscores");
    if (/%[0-9a-f]{2}/i.test(slug))                  issues.push("url-encoded chars");
    if (slug.split("/").some(s => s.length > 60))    issues.push("segment > 60 chars");
    if (/\b\d{5,}\b/.test(slug))                     issues.push("numeric IDs");
    if (/[?&=]/.test(slug))                          issues.push("query params in path");
    return { slug, score: issues.length === 0 ? "good" : issues.length === 1 ? "fair" : "poor", issues };
  } catch { return { slug: "", score: "unknown", issues: [] }; }
}

// ── Schema depth analysis ─────────────────────────────────────────────────────
function analyzeSchema(html) {
  const blocks = all(
    html,
    /<script\s[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  );
  const schemas = [];
  for (const b of blocks) {
    try {
      const parsed = JSON.parse(b);
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      for (const top of arr) {
        // Yoast / RankMath / WordPress emit {"@context":..,"@graph":[{...},{...}]}: the typed
        // nodes live inside @graph, not at the top level (which has no @type). Expand it, else
        // every schema is missed and "No Schema.org structured data" (a -10 health hit) fires
        // wrongly on the most common CMS in the market.
        const nodes = Array.isArray(top && top["@graph"]) ? top["@graph"] : [top];
        for (const obj of nodes) {
          const type = obj && obj["@type"] || null;
          if (!type) continue;
          const props = {};
          for (const k of ["name","telephone","email","address","url","description","ratingValue","reviewCount","priceRange","openingHours","geo","sameAs"]) {
            if (obj[k] !== undefined) props[k] = typeof obj[k] === "object" ? JSON.stringify(obj[k]).slice(0, 80) : String(obj[k]).slice(0, 80);
          }
          schemas.push({ type, properties: props, propertyCount: Object.keys(obj).length - 1 });
        }
      }
    } catch {
      const m = b.match(/"@type"\s*:\s*"([^"]+)"/);
      if (m) schemas.push({ type: m[1], properties: {}, propertyCount: 0 });
    }
  }
  return schemas;
}

// ── CMS / SEO-plugin detection (static markers only, no rendering) ──────────────
// Populates crawlData.cms / cmsPlugin, which doctor-fizz-logic.js already reads to name
// the LIKELY cause of duplicate title/head tags (e.g. "your site runs on WordPress, an SEO
// plugin is likely duplicating tags"). Before this, those fields were never set, so that
// cause hint was always empty. All markers are in the raw HTML/headers we already fetched.
function detectCms(html, headers) {
  const h = String(html || "");
  const gen = (h.match(/<meta\s[^>]*name=["']generator["'][^>]*content=["']([^"']+)["']/i) || [])[1] || "";
  const hdr = (k) => { try { return String(headers?.get?.(k) || ""); } catch { return ""; } };
  const powered = hdr("x-powered-by"), server = hdr("server");
  let cms = "";
  if (/wordpress/i.test(gen) || /\/wp-content\//i.test(h) || /\/wp-json\//i.test(h)) cms = "WordPress";
  else if (/shopify/i.test(gen) || /cdn\.shopify\.com/i.test(h) || /Shopify\.theme/i.test(h) || /shopify/i.test(powered)) cms = "Shopify";
  else if (/wix/i.test(gen) || /static\.parastorage\.com/i.test(h) || hdr("x-wix-request-id")) cms = "Wix";
  else if (/squarespace/i.test(gen) || /(?:assets|static)\.squarespace\.com/i.test(h)) cms = "Squarespace";
  else if (/webflow/i.test(gen) || /assets\.website-files\.com/i.test(h)) cms = "Webflow";
  else if (/drupal/i.test(gen) || /\/sites\/default\/files\//i.test(h) || /drupal/i.test(powered)) cms = "Drupal";
  else if (/joomla/i.test(gen)) cms = "Joomla";
  else if (/ghost/i.test(gen) || /ghost/i.test(powered)) cms = "Ghost";
  let plugin = "";
  if (/yoast/i.test(h)) plugin = "Yoast SEO";
  else if (/rank\s*math/i.test(h)) plugin = "Rank Math";
  else if (/all in one seo|aioseo/i.test(h)) plugin = "All in One SEO";
  return { cms, plugin };
}

// ── Core Web Vitals hints ─────────────────────────────────────────────────────
function cwvHints(html) {
  const hints = [];
  // LCP: large images without loading=eager (might be lazy = bad for LCP)
  const lazyHeroRisk = /loading=["']lazy["'][^>]*(?:class|id)=["'][^"']*(?:hero|banner|header|above)[^"']*["']/i.test(html)
    || /(?:class|id)=["'][^"']*(?:hero|banner|header)[^"']*["'][^>]*loading=["']lazy["']/i.test(html);
  if (lazyHeroRisk) hints.push({ type: "LCP", issue: "Hero/banner image may be lazy-loaded, can delay LCP", severity: "high" });

  // CLS: images without width+height attributes
  const imgs = [...html.matchAll(/<img\s([^>]*)>/gi)].map(m => m[1]);
  const imgsMissingDims = imgs.filter(a => !/width=/i.test(a) || !/height=/i.test(a)).length;
  if (imgsMissingDims > 0) hints.push({ type: "CLS", issue: `${imgsMissingDims} image(s) missing width/height, causes layout shift`, severity: imgsMissingDims > 3 ? "high" : "medium" });

  // FID/INP: many render-blocking scripts
  const blockingScripts = count(html, /<script(?!\s[^>]*(?:async|defer|type=["']module["']))[^>]*src=/gi);
  if (blockingScripts > 3) hints.push({ type: "FID/INP", issue: `${blockingScripts} render-blocking scripts, blocks main thread`, severity: "medium" });

  // Inline styles bloat
  const inlineStyles = count(html, /style=["'][^"']{100,}["']/gi);
  if (inlineStyles > 10) hints.push({ type: "CLS", issue: `${inlineStyles} elements with large inline styles`, severity: "low" });

  // Total script count
  const totalScripts = count(html, /<script/gi);
  if (totalScripts > 20) hints.push({ type: "INP", issue: `${totalScripts} total script tags, heavy JS payload`, severity: totalScripts > 40 ? "high" : "medium" });

  return hints;
}

// ── Social meta completeness ──────────────────────────────────────────────────
function socialMeta(html) {
  // Match EITHER attribute order. Many CMSs emit content-first
  // (<meta content=".." property="og:title">); the old property-first-only regexes
  // returned null on those and reported the tags as missing. Mirrors the reversed-order
  // fallback already used for the meta description above.
  const ogM = (p, n) => first(html, new RegExp(`<meta\\s[^>]*property=["']${p}["'][^>]*content=["']([^"']{1,${n}})["']`, "i"))
                     || first(html, new RegExp(`<meta\\s[^>]*content=["']([^"']{1,${n}})["'][^>]*property=["']${p}["']`, "i"));
  const twM = (t, n) => first(html, new RegExp(`<meta\\s[^>]*name=["']${t}["'][^>]*content=["']([^"']{1,${n}})["']`, "i"))
                     || first(html, new RegExp(`<meta\\s[^>]*content=["']([^"']{1,${n}})["'][^>]*name=["']${t}["']`, "i"));
  const og = {
    title:       ogM("og:title", 200),
    description: ogM("og:description", 400),
    image:       ogM("og:image", 500),
    type:        ogM("og:type", 50),
    url:         ogM("og:url", 300),
  };
  const twitter = {
    card:        twM("twitter:card", 50),
    title:       twM("twitter:title", 200),
    description: twM("twitter:description", 400),
    image:       twM("twitter:image", 500),
  };
  const issues = [];
  if (!og.title)       issues.push("Missing og:title");
  if (!og.description) issues.push("Missing og:description");
  if (!og.image)       issues.push("Missing og:image (social shares won't have preview image)");
  if (!twitter.card)   issues.push("Missing twitter:card");
  return { og, twitter, issues, score: Math.round(((4 - issues.length) / 4) * 100) };
}

// ── Content quality analysis ──────────────────────────────────────────────────
function contentQuality(html) {
  // Strip scripts/styles/nav/header/footer
  const clean = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<(nav|header|footer|aside)[^>]*>[\s\S]*?<\/\1>/gi, "");

  const text = clean.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const wordCount = text.split(/\s+/).filter(w => w.length > 2).length;

  // Heading hierarchy
  const headings = {};
  for (const tag of ["h1","h2","h3","h4","h5","h6"]) {
    const found = all(html, new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi"))
      .map(h => h.replace(/<[^>]+>/g, "").trim())
      .filter(Boolean);
    if (found.length) headings[tag] = found;
  }

  const paragraphs = count(html, /<p[\s>]/gi);
  const lists      = count(html, /<[uo]l[\s>]/gi);
  const tables     = count(html, /<table[\s>]/gi);
  const images     = count(html, /<img[\s>]/gi);

  // Estimate reading time (avg 200 words/min)
  const readingTimeMins = Math.ceil(wordCount / 200);

  // Content richness score
  let richness = 0;
  if (wordCount > 300)  richness += 20;
  if (wordCount > 800)  richness += 15;
  if (wordCount > 1500) richness += 10;
  if (headings.h2?.length > 0) richness += 15;
  if (headings.h3?.length > 0) richness += 10;
  if (lists > 0)        richness += 10;
  if (images > 0)       richness += 10;
  if (tables > 0)       richness += 10;

  return { wordCount, paragraphs, lists, tables, images, readingTimeMins, headings, richness: Math.min(100, richness) };
}

// ── Internal links extraction ─────────────────────────────────────────────────
function extractInternalLinks(html, pageUrl, host) {
  const links = new Set();
  for (const m of html.matchAll(/<a\s[^>]*href=["']([^"'#?][^"']*)["']/gi)) {
    const href = m[1].trim();
    try {
      const abs = new URL(href, pageUrl).href;
      const u   = new URL(abs);
      if (u.hostname.replace(/^www\./, "") === host && u.pathname !== new URL(pageUrl).pathname) {
        links.add(abs.split("?")[0].split("#")[0]);
      }
    } catch { /* ignore */ }
  }
  return [...links];
}

// ── E-E-A-T signals ───────────────────────────────────────────────────────────
function eatSignals(html, url, host) {
  const signals = {
    hasAuthorInfo:    /author|written by|by\s+[A-Z][a-z]+|contributor/i.test(html),
    hasContactInfo:   /contact\s*us|phone|email|address|reach\s*us/i.test(html),
    hasAboutPage:     /about\s*us|our\s*team|who\s*we\s*are/i.test(html),
    hasPrivacyPolicy: /privacy\s*policy/i.test(html),
    hasTerms:         /terms\s*(of\s*service|and\s*conditions|of\s*use)/i.test(html),
    hasSocialLinks:   /facebook\.com|twitter\.com|linkedin\.com|instagram\.com|youtube\.com/i.test(html),
    hasTrustBadges:   /ssl\s*secure|guaranteed|certified|award|featured\s*in|as\s*seen/i.test(html),
    hasReviews:       /review|testimonial|rating|★|stars/i.test(html),
    hasLastModified:  false,
    hasBreadcrumbs:   /breadcrumb|crumb/i.test(html),
  };
  const score = Object.values(signals).filter(Boolean).length;
  const missing = [];
  if (!signals.hasAuthorInfo)    missing.push("No author/contributor info found");
  if (!signals.hasContactInfo)   missing.push("No contact information on page");
  if (!signals.hasTrustBadges)   missing.push("No trust signals/awards/certifications");
  if (!signals.hasSocialLinks)   missing.push("No social media links");
  // Expose `hasAuthor` too: report-evidence.js reads p.eeat.author/byline/hasAuthor for the
  // weight-8 Author E-E-A-T signal, but the producer only ever set hasAuthorInfo, so that
  // signal was permanently OFF on every site. Alias it here (score/maxScore are computed
  // from `signals` above and are unaffected, so no drift).
  return { ...signals, hasAuthor: signals.hasAuthorInfo, score, maxScore: Object.keys(signals).length - 1, missing };
}

// ── SERP preview generator ────────────────────────────────────────────────────
function serpPreview(url, metaTitle, metaDesc) {
  const domain = (() => { try { return new URL(url).hostname; } catch { return url; } })();
  const displayUrl = url.replace(/^https?:\/\//, "").replace(/\/$/, "").slice(0, 60);
  const titleTrunc = metaTitle ? (metaTitle.length > 60 ? metaTitle.slice(0, 57) + "…" : metaTitle) : null;
  const descTrunc  = metaDesc  ? (metaDesc.length > 160 ? metaDesc.slice(0, 157) + "…"  : metaDesc)  : null;
  return { displayUrl, domain, title: titleTrunc, description: descTrunc };
}

// ── Page speed hints (lightweight) ───────────────────────────────────────────
function pageSpeedHints(html) {
  const totalScripts  = count(html, /<script/gi);
  const totalStyles   = count(html, /<link[^>]*rel=["']stylesheet["']/gi);
  const totalImages   = count(html, /<img/gi);
  const lazyImages    = count(html, /loading=["']lazy["']/gi);
  const nextGenImages = count(html, /\.webp|\.avif/gi);
  const iframes       = count(html, /<iframe/gi);
  const preloads      = count(html, /<link[^>]*rel=["']preload["']/gi);

  const hints = [];
  if (totalScripts > 25) hints.push(`${totalScripts} scripts, consider bundling/deferring`);
  if (totalStyles > 5)   hints.push(`${totalStyles} stylesheets, consider combining`);
  if (lazyImages < totalImages / 2 && totalImages > 3) hints.push(`Only ${lazyImages}/${totalImages} images use lazy loading`);
  if (nextGenImages === 0 && totalImages > 0) hints.push("No WebP/AVIF images found, serve next-gen formats");
  if (iframes > 3)       hints.push(`${iframes} iframes, may slow down page`);
  if (preloads === 0)    hints.push("No <link rel=preload> found, consider preloading critical assets");

  return { totalScripts, totalStyles, totalImages, lazyImages, nextGenImages, iframes, preloads, hints };
}

// ── Full page audit ───────────────────────────────────────────────────────────
// `prefetched` (optional): a RENDERED page already fetched via Browserless
// ({ html, statusCode, lastModified, contentType, xRobotsHeader, error }). When present,
// every extractor below runs on the JS-rendered DOM, so client-side H1/schema/links/word
// count become visible. When absent, behaviour is byte-identical to the raw-HTML crawl.
async function auditPage(url, keywords = [], host = "", prefetched = null) {
  let html = "";
  let statusCode = null;
  let lastModified = null;
  let contentType = null;
  let xRobotsHeader = "";
  let fetchError = null;
  const renderMode = prefetched ? "rendered" : "raw";

  try {
    if (prefetched) {
      statusCode    = prefetched.statusCode ?? null;
      lastModified  = prefetched.lastModified || null;
      contentType   = prefetched.contentType || "text/html";
      xRobotsHeader = prefetched.xRobotsHeader || "";
      html          = prefetched.html || "";
      if (prefetched.error || !html) return { url, statusCode, error: prefetched.error || "empty render", issues: [] };
      if (statusCode != null && statusCode >= 400) return { url, statusCode, error: `HTTP ${statusCode}`, issues: [] };
    } else {
      const res = await timedFetch(url);
      statusCode  = res.status;
      lastModified = res.headers.get("last-modified") || null;
      contentType  = res.headers.get("content-type") || "";
      xRobotsHeader = res.headers.get("x-robots-tag") || "";   // noindex/nofollow can be set via HTTP header, not just <meta>
      if (!res.ok) return { url, statusCode, error: `HTTP ${res.status}`, issues: [] };
      if (!contentType.includes("html")) return { url, statusCode, error: "Not HTML", issues: [] };
      html = await res.text();
    }
  } catch (err) {
    return { url, statusCode, error: err?.message || "fetch failed", issues: [] };
  }

  const kws = keywords.map(k => String(k).toLowerCase());

  // Meta basics
  // Caps raised well past any real length: an over-long title/description used to fail the
  // bounded regex entirely and get reported as MISSING (the opposite of the real problem).
  // The too-long/too-short grading below still flags length issues.
  const metaTitle  = first(html, /<title[^>]*>([^<]{1,3000})<\/title>/i);
  const metaDesc   =
    first(html, /<meta\s[^>]*name=["']description["'][^>]*content=["']([^"']{1,3000})["']/i) ||
    first(html, /<meta\s[^>]*content=["']([^"']{1,3000})["'][^>]*name=["']description["']/i);
  const canonical  =
    first(html, /<link\s[^>]*rel=["']canonical["'][^>]*href=["']([^"']*)["']/i) ||
    first(html, /<link\s[^>]*href=["']([^"']*)["'][^>]*rel=["']canonical["']/i);
  const robotsMeta =
    first(html, /<meta\s[^>]*name=["']robots["'][^>]*content=["']([^"']*)["']/i) ||
    first(html, /<meta\s[^>]*content=["']([^"']*)["'][^>]*name=["']robots["']/i) ||
    "index, follow";
  const isNoindex = /noindex/i.test(robotsMeta || "") || /noindex/i.test(xRobotsHeader);
  const isNofollow = /nofollow/i.test(robotsMeta || "") || /nofollow/i.test(xRobotsHeader);
  const viewport  = first(html, /<meta\s[^>]*name=["']viewport["'][^>]*content=["']([^"']*)["']/i);
  const charset   = first(html, /<meta\s[^>]*charset=["']([^"']*)["']/i);
  const hreflang  = all(html, /<link\s[^>]*hreflang=["']([^"']*)["'][^>]*>/gi);

  // H1 tags
  const h1s = all(html, /<h1[^>]*>([\s\S]*?)<\/h1>/gi)
    .map(h => h.replace(/<[^>]+>/g, "").trim()).filter(Boolean);
  const h1HasKeyword = h1s.some(h => kws.some(k => h.toLowerCase().includes(k)));

  // H2s
  const h2s = all(html, /<h2[^>]*>([\s\S]*?)<\/h2>/gi)
    .map(h => h.replace(/<[^>]+>/g, "").trim()).filter(Boolean).slice(0, 10);

  // Images audit
  const allImgs = [...html.matchAll(/<img\s([^>]*)>/gi)].map(m => m[1]);
  const _noAlt = allImgs.filter(a => !(/alt=["'][^"']+["']/i.test(a)) || /alt=["']\s*["']/i.test(a));
  const imgsWithoutAlt  = _noAlt.length;
  // B9 — collect the SRC of each image-without-alt so the site total can dedupe by src (a shared
  // template logo/header repeated on every page should count once, not once per crawled page). Src
  // normalised to path (strip protocol/host/query) so absolute + relative refs to the same asset merge.
  const imgsWithoutAltSrcs = _noAlt.map(a => { const m = a.match(/src=["']([^"']+)["']/i); if (!m) return null;
    return String(m[1]).trim().replace(/^https?:\/\/[^/]+/i, "").replace(/[?#].*$/, "").toLowerCase() || null; }).filter(Boolean);
  const imgsWithoutDims = allImgs.filter(a => !/width=/i.test(a) || !/height=/i.test(a)).length;
  // Split to match Screaming Frog: no alt= attribute at all vs alt present-but-empty.
  const imgsMissingAltAttr = allImgs.filter(a => !/\balt=/i.test(a)).length;
  const imgsMissingAltText = allImgs.filter(a => /\balt=["']\s*["']/i.test(a)).length;

  // Structural validation — count from the DOCUMENT STRUCTURE, not raw bytes, so the result
  // matches what a browser (and Google) actually parse. A page-builder "HTML" widget
  // (Elementor, WPBakery, etc.) commonly holds a pasted <!DOCTYPE html>…<head>…<title>…<body>
  // boilerplate; that whole blob is BODY content, so the browser DISCARDS the nested
  // <head>/<body> and keeps exactly one of each. Counting raw <head>/<body>/<title>
  // occurrences (the old regex) falsely flagged ~every page as "multiple head/body/title".
  // The real document head ends at the first </head>; nothing after it can add a second
  // structural head, and only a <title> INSIDE that head sets the page title. Verified vs a
  // parse5 DOM parse of a live Elementor site: raw regex saw 3/3/3, the real DOM is 1/1/1.
  const headEndIdx   = html.search(/<\/head>/i);
  const bodyStartIdx = html.search(/<body[\s>]/i);
  const headRegionEnd = headEndIdx >= 0 ? headEndIdx : (bodyStartIdx >= 0 ? bodyStartIdx : html.length);
  const headRegion    = html.slice(0, headRegionEnd);
  const headInStruct  = count(headRegion, /<head[\s>]/gi);   // genuine structural heads (usually 1)
  const titleInHead   = count(headRegion, /<title[\s>]/gi);  // the <title> that is the SEO signal
  const headCount  = Math.max(headInStruct, /<head[\s>]/i.test(html) ? 1 : 0);
  const bodyCount  = /<body[\s>]/i.test(html) ? 1 : 0;       // a real DOM always resolves to one <body>
  const titleCount = titleInHead;
  const multipleHead  = headCount > 1;   // true only for a genuine second structural <head>
  const multipleBody  = bodyCount > 1;   // effectively never; kept for output-shape parity
  const multipleTitle = titleCount > 1;  // more than one <title> inside the real <head>
  const firstTitleIdx = html.search(/<title[\s>]/i);
  const titleOutsideHead = titleInHead === 0 && firstTitleIdx >= 0;
  // Mixed content: insecure http:// resources/links on an https page.
  const httpResourceCount = (html.match(/(?:src|href)=["']http:\/\/[^"']+["']/gi) || [])
    .filter(s => !/http:\/\/(localhost|127\.0|schema\.org|www\.w3\.org|ogp\.me|purl\.org|gmpg\.org)/i.test(s)).length;

  // Internal links
  const internalLinks = extractInternalLinks(html, url, host);

  // Schema
  const schemas = analyzeSchema(html);

  // Social meta
  const social = socialMeta(html);

  // Content quality
  const content = contentQuality(html);

  // CWV hints
  const cwv = cwvHints(html);

  // Page speed
  const speed = pageSpeedHints(html);

  // E-E-A-T signals
  const eeat = eatSignals(html, url, host);

  // SERP preview
  const serp = serpPreview(url, metaTitle, metaDesc);

  // Slug
  const slug = slugQuality(url);

  // Issues list
  const issues = [];
  if (!metaTitle)                      issues.push("Missing meta title");
  else if (metaTitle.length < 30)      issues.push(`Meta title too short (${metaTitle.length} chars, min 30)`);
  else if (metaTitle.length > 60)      issues.push(`Meta title too long (${metaTitle.length} chars, max 60)`);

  if (!metaDesc)                       issues.push("Missing meta description");
  else if (metaDesc.length < 50)       issues.push(`Meta description too short (${metaDesc.length} chars, min 50)`);
  else if (metaDesc.length > 160)      issues.push(`Meta description too long (${metaDesc.length} chars, max 160)`);

  if (h1s.length === 0)                issues.push("No H1 tag found");
  else if (h1s.length > 1)            issues.push(`Multiple H1 tags (${h1s.length}), use only one`);
  if (kws.length > 0 && !h1HasKeyword) issues.push("H1 doesn't include a target keyword");

  if (multipleTitle)                   issues.push(`Multiple <title> tags (${titleCount})`);
  if (titleOutsideHead)                issues.push("Page <title> is outside the <head>");
  if (multipleHead)                    issues.push(`Multiple <head> tags (${headCount})`);
  if (multipleBody)                    issues.push(`Multiple <body> tags (${bodyCount})`);
  if (httpResourceCount > 0)           issues.push(`${httpResourceCount} insecure HTTP resource(s), mixed content`);

  if (imgsWithoutAlt > 0)             issues.push(`${imgsWithoutAlt} image(s) missing alt text`);
  if (imgsWithoutDims > 0)            issues.push(`${imgsWithoutDims} image(s) missing width/height (CLS risk)`);
  if (schemas.length === 0)           issues.push("No Schema.org structured data");
  if (isNoindex)                      issues.push("Page is noindex, so it will not appear in search results");
  if (!viewport)                      issues.push("No viewport meta tag, not mobile-friendly");
  if (slug.issues.length > 0)        issues.push(`Slug: ${slug.issues.join(", ")}`);
  if (content.wordCount < 200)        issues.push(`Thin content (only ${content.wordCount} words)`);
  if (social.issues.length > 0)      issues.push(...social.issues);
  if (cwv.length > 0)                 issues.push(...cwv.map(h => `${h.type}: ${h.issue}`));
  if (!canonical)                     issues.push("No canonical tag");
  if (speed.hints.length > 0)        issues.push(...speed.hints);

  return {
    url, statusCode, lastModified, contentType,
    metaTitle, metaDesc, canonical, robotsMeta, isNoindex, isNofollow,
    viewport, charset, hreflang,
    h1s, h1HasKeyword, h2s,
    imgsWithoutAlt, imgsWithoutAltSrcs, imgsWithoutDims, imgsMissingAltAttr, imgsMissingAltText,
    multipleHead, multipleBody, multipleTitle, titleOutsideHead, httpResourceCount,
    internalLinks,
    schemas,
    social,
    content,
    cwv,
    speed,
    eeat,
    serp,
    slug,
    issues,
    issueCount: issues.length,
    render_mode: renderMode,   // "rendered" (Browserless) | "raw" — additive, honest provenance
  };
}

// ── Duplicate detection ───────────────────────────────────────────────────────
function detectDuplicates(pages) {
  const titleMap = {};
  const descMap  = {};
  const dupes    = [];

  for (const p of pages) {
    const t = p.metaTitle?.toLowerCase().trim();
    const d = p.metaDesc?.toLowerCase().trim();
    if (t) (titleMap[t] = titleMap[t] || []).push(p.url);
    if (d) (descMap[d]  = descMap[d]  || []).push(p.url);
  }

  for (const [title, urls] of Object.entries(titleMap)) {
    if (urls.length > 1) dupes.push({ type: "title", value: title.slice(0, 80), urls });
  }
  for (const [desc, urls] of Object.entries(descMap)) {
    if (urls.length > 1) dupes.push({ type: "description", value: desc.slice(0, 80), urls });
  }
  return dupes;
}

// ── Internal link graph + orphan detection ─────────────────────────────────────
function buildLinkGraph(pages) {
  const crawledUrls = new Set(pages.map(p => p.url));
  const linked      = new Set();
  const graph       = {};

  for (const p of pages) {
    graph[p.url] = p.internalLinks || [];
    for (const l of p.internalLinks || []) linked.add(l);
  }

  const orphans = [...crawledUrls].filter(u => !linked.has(u) && !u.match(/\/(index|home)?\/?$/));
  return { graph, orphanPages: orphans };
}

// ── Broken internal links check ────────────────────────────────────────────────
async function checkBrokenLinks(pages, host) {
  const allInternal = new Set();
  for (const p of pages) {
    for (const l of p.internalLinks || []) allInternal.add(l);
  }

  const toCheck = [...allInternal]
    .filter(u => !pages.some(p => p.url === u))
    .slice(0, 20);

  const broken = [];
  const BATCH  = 5;
  for (let i = 0; i < toCheck.length; i += BATCH) {
    const batch = toCheck.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(async url => {
        try {
          const r = await timedFetch(url, { timeout: 6000 });
          if (r.status >= 400) return { url, status: r.status };
          return null;
        } catch { return { url, status: "unreachable" }; }
      })
    );
    broken.push(...results.filter(Boolean));
  }
  return broken;
}

// ── SEO health score (0-100) ─────────────────────────────────────────────────
function computeHealthScore(result) {
  let score = 100;
  const pages = result.pages || [];
  const n     = pages.length || 1;

  const pct = k => Math.round((result.summary[k] || 0) / n * 100);

  // Deductions per category
  if (!result.hasSitemap)                       score -= 10;
  if (result.crawlBlockedByRobots)              score -= 20;

  const missingTitlePct = pct("pagesMissingMetaTitle");
  if (missingTitlePct > 50)  score -= 15;
  else if (missingTitlePct > 20) score -= 8;

  const missingDescPct = pct("pagesMissingMetaDesc");
  if (missingDescPct > 50)   score -= 12;
  else if (missingDescPct > 20) score -= 6;

  const missingH1Pct = pct("pagesMissingH1");
  if (missingH1Pct > 50)     score -= 10;
  else if (missingH1Pct > 20) score -= 5;

  if ((result.summary?.pagesWithSchemaTypes?.length || 0) === 0) score -= 10;
  if ((result.summary?.totalImgsWithoutAlt || 0) > 10) score -= 8;
  if ((result.duplicates || []).length > 2)             score -= 6;
  if ((result.brokenLinks || []).length > 0)            score -= 5 * Math.min(3, result.brokenLinks.length);
  if ((result.summary?.pagesNoindex || 0) > n / 2)      score -= 8;

  return Math.max(0, Math.min(100, Math.round(score)));
}

// ── Sitemap fetch & expand ────────────────────────────────────────────────────
async function discoverSitemapUrls(base, robotsSitemapHint) {
  const candidates = [
    robotsSitemapHint,
    `${base}/sitemap.xml`,
    `${base}/sitemap_index.xml`,
    `${base}/sitemap/sitemap.xml`,
    `${base}/wp-sitemap.xml`,
    `${base}/sitemap-index.xml`,
  ].filter(Boolean);

  for (const url of candidates) {
    try {
      const r = await timedFetch(url);
      if (!r.ok) continue;
      const xml = await r.text();
      if (!xml.includes("<url") && !xml.includes("<sitemap")) continue;

      // Check if it's a sitemap index
      const isSitemapIndex = xml.includes("<sitemapindex") || (
        (xml.match(/<sitemap>/gi) || []).length > 0
      );

      const urls = isSitemapIndex
        ? await expandSitemapIndex(xml, base, MAX_PAGES)
        : parseSitemapXml(xml, MAX_PAGES);

      return { found: true, url, urls, total: urls.total || urls.length };
    } catch { /* try next */ }
  }
  return { found: false, url: null, urls: [], total: 0 };
}

// ── BFS internal-link crawl (fallback when sitemap is missing/thin) ────────────
// Fetches the homepage, extracts internal links, and breadth-first discovers
// more pages up to `limit`. This is how we recover when a site has no sitemap
// but hundreds of pages reachable via navigation.
async function discoverViaLinks(base, host, seedUrls, limit) {
  const queue   = [...seedUrls];
  const visited = new Set(seedUrls);
  const found   = [];

  while (queue.length && found.length < limit) {
    const batch = queue.splice(0, CONCURRENCY);
    const results = await Promise.all(batch.map(async (u) => {
      try {
        const r = await timedFetch(u);
        if (!r.ok) return null;
        const ct = r.headers.get("content-type") || "";
        if (!ct.includes("html")) return null;
        const html = await r.text();
        return { url: u, links: extractInternalLinks(html, u, host) };
      } catch { return null; }
    }));

    for (const res of results) {
      if (!res) continue;
      found.push(res.url);
      for (const link of res.links) {
        if (found.length + queue.length >= limit * 3) break; // bound the frontier
        if (!visited.has(link) && sameHost(link, host)) {
          visited.add(link);
          queue.push(link);
        }
      }
    }
  }
  return found.slice(0, limit);
}

function sameHost(url, host) {
  try { return new URL(url).hostname.replace(/^www\./, "") === host; }
  catch { return false; }
}

// ── Main crawl ────────────────────────────────────────────────────────────────
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
    hasLlmsTxt: false,        // GEO/AEO: does the site publish an /llms.txt guide for AI engines
    llmsTxtUrl: null,
    pageCount: 0,           // pages we deep-audited
    sitemapUrlCount: 0,     // total URLs listed in the sitemap(s)
    indexedPages: null,     // Google-indexed page count via site:domain
    totalPagesEstimate: 0,  // best estimate of the site's true page count
    discoveryMethod: null,  // "sitemap" | "links" | "homepage-only"
    pages: [],
    duplicates: [],
    brokenLinks: [],
    orphanPages: [],
    eeatSummary: {},
    healthScore: 0,
    summary: {
      pagesMissingMetaTitle: 0,
      pagesMissingMetaDesc:  0,
      pagesMissingH1:        0,
      pagesMultipleH1:       0,
      pagesMultipleTitle:    0,
      pagesTitleOutsideHead: 0,
      pagesMultipleHead:     0,
      pagesMultipleBody:     0,
      pagesWithMixedContent: 0,
      pagesNoindex:          0,
      pagesNoCanonical:      0,
      pagesWithSchemaTypes:  [],
      schemaTypes:           {},
      totalImgsWithoutAlt:   0,
      totalImgsMissingAltAttr: 0,
      totalImgsMissingAltText: 0,
      totalImgsWithoutDims:  0,
      slugIssuesCount:       0,
      thinContentCount:      0,
      avgWordCount:          0,
      socialMissing:         0,
      cwvIssuesCount:        0,
      commonIssues:          [],
    },
  };

  // 1. robots.txt
  try {
    const r = await timedFetch(`${base}/robots.txt`);
    if (r.ok) {
      const txt = await r.text();
      result.hasRobots       = true;
      result.robotsContent   = txt.slice(0, 3000);
      result.robotsDisallows = [...txt.matchAll(/^Disallow:\s*(.+)$/gm)].map(m => m[1].trim());
      // Only block when the group that applies to "*" actually disallows the site root.
      // The old lazy /User-agent:\s*\*[\s\S]*?Disallow:\s*\// matched ACROSS group
      // boundaries, so a robots.txt that allowed "*" but had a later
      // "User-agent: BadBot / Disallow: /" block falsely set crawlBlockedByRobots=true and
      // cost that client 20 health points for no reason. Walk the groups and check the "*"
      // group only (a bare "Disallow: /", not overridden by an "Allow: /").
      let starDisallowsRoot = false, inStar = false;
      for (const rawLine of txt.split(/\r?\n/)) {
        const line = rawLine.split("#")[0].trim();
        const m = line.match(/^(user-agent|allow|disallow)\s*:\s*(.*)$/i);
        if (!m) continue;
        const field = m[1].toLowerCase(), value = m[2].trim();
        if (field === "user-agent") { inStar = value === "*"; continue; }
        if (!inStar) continue;
        if (field === "disallow" && value === "/") starDisallowsRoot = true;
        else if (field === "allow" && value === "/") starDisallowsRoot = false;   // explicit allow-root overrides
      }
      if (starDisallowsRoot) result.crawlBlockedByRobots = true;

      const sitemapHint = txt.match(/^Sitemap:\s*(https?:\/\/\S+)/im)?.[1]?.trim();
      if (sitemapHint) result.sitemapUrl = sitemapHint;
    }
  } catch { /* ignore */ }

  // 1b. llms.txt — the GEO/AEO equivalent of robots.txt: a curated Markdown guide
  //     that tells AI answer engines what the site is and which pages to read.
  //     Count it as "present" only when it returns 200 with real Markdown content
  //     (not an SPA/404 HTML fallback served as text/html).
  try {
    const lr = await timedFetch(`${base}/llms.txt`);
    if (lr.ok) {
      const ct = (lr.headers.get("content-type") || "").toLowerCase();
      const body = (await lr.text()) || "";
      const looksLikeMarkdown = body.trim().length > 20 && !/^\s*<(?:!doctype|html)/i.test(body);
      if (!ct.includes("text/html") && looksLikeMarkdown) {
        result.hasLlmsTxt = true;
        result.llmsTxtUrl = `${base}/llms.txt`;
      }
    }
  } catch { /* ignore */ }

  // 2. Sitemap discovery + Google-indexed page count (in parallel)
  const [sitemap, indexedCount] = await Promise.all([
    discoverSitemapUrls(base, result.sitemapUrl),
    fetchIndexedPageCount(host),
  ]);
  result.hasSitemap      = sitemap.found;
  result.sitemapUrlCount = sitemap.total || sitemap.urls.length || 0;
  result.indexedPages    = indexedCount;
  if (sitemap.found) result.sitemapUrl = sitemap.url;

  // 3. Build the deep-audit page list.
  //    PRIORITISE the homepage's own nav/footer links — those are the site's most
  //    important pages (services, blog, contact…). A post-heavy sitemap can
  //    otherwise bury them past the MAX_PAGES sample, so real issues on the main
  //    pages (e.g. a missing H1 on /contact) go unreported while we audit 50 blog
  //    posts that all have H1s. We crawl homepage-links FIRST, then fill the rest
  //    from the sitemap. Falls back to a BFS link crawl if there's no usable sitemap.
  let navLinks = [];
  try {
    const homeR = await timedFetch(base);
    if (homeR.ok && (homeR.headers.get("content-type") || "").includes("html")) {
      const homeHtml = await homeR.text();
      navLinks = extractInternalLinks(homeHtml, base, host);
      const detected = detectCms(homeHtml, homeR.headers);   // populate cms/cmsPlugin (cause hint for dup tags)
      if (detected.cms) result.cms = detected.cms;
      if (detected.plugin) result.cmsPlugin = detected.plugin;
    }
  } catch { /* ignore */ }

  let pagesToCrawl;
  const sitemapPages = sitemap.urls.filter(u => u !== base);
  if (sitemapPages.length >= 3 || navLinks.length) {
    const seen = new Set();
    pagesToCrawl = [base, ...navLinks, ...sitemapPages].filter((u) => {
      const k = u.split("#")[0].split("?")[0].replace(/\/+$/, "");
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }).slice(0, MAX_PAGES);
    result.discoveryMethod = sitemapPages.length >= 3 ? (navLinks.length ? "sitemap+nav" : "sitemap") : "links";
  } else {
    // Seed BFS from homepage (+ any few sitemap URLs we did find)
    const discovered = await discoverViaLinks(base, host, [base, ...sitemapPages], MAX_PAGES);
    pagesToCrawl = discovered.length > 1 ? discovered : [base];
    result.discoveryMethod = discovered.length > 1 ? "links" : "homepage-only";
  }

  // 4. Crawl with concurrency, bounded by a wall-clock budget. Small/medium sites
  //    finish fully (well under the budget); very large sites crawl as many pages
  //    as time allows and stop gracefully instead of timing out the function.
  let pages = [];
  const crawlDeadline = Date.now() + CRAWL_BUDGET_MS;
  result.crawlTruncated = false;

  // ── RENDERED CRAWL (opt-in via CRAWLER_ENGINE=v2) ─────────────────────────────
  // When enabled, the first MAX_RENDER pages are fetched through a real headless Chromium
  // (Browserless, the same engine the GEO worker uses), so JS-injected H1/schema/links/word
  // count become visible. Every extractor below is UNCHANGED; only the HTML source is richer.
  // Bounded to stay inside the Vercel budget (full-site rendering runs on the VPS worker); a
  // render failure on any page silently falls back to the raw fetch. Default (legacy) is the
  // raw-HTML crawl, byte-identical to before.
  const CRAWLER_ENGINE = String(process.env.CRAWLER_ENGINE || "legacy").toLowerCase();
  const useRendered = CRAWLER_ENGINE === "v2" && !!process.env.BROWSERLESS_TOKEN;
  const MAX_RENDER = Math.max(0, Number(process.env.CRAWL_MAX_RENDER || 25));
  const effConc = useRendered ? Math.max(1, Number(process.env.CRAWL_RENDER_CONCURRENCY || 3)) : CONCURRENCY;
  let renderFetcher = null;
  if (useRendered && MAX_RENDER > 0) {
    try {
      const { createPlaywrightFetcher } = await import("@/lib/seo/crawler/playwrightFetch");
      renderFetcher = await createPlaywrightFetcher({});
    } catch { renderFetcher = null; }   // renderer unavailable -> whole crawl falls back to raw
  }
  const renderPrefetch = async (u) => {
    if (!renderFetcher) return null;
    try {
      const rp = await renderFetcher.fetchPage(u);
      if (!rp || rp.error || !rp._body || (rp.status != null && rp.status >= 400)) return null;
      const h = rp.headers || {};
      const hg = (k) => h[k] || h[k.toLowerCase()] || "";
      return { statusCode: rp.status ?? 200, html: rp._body, contentType: hg("content-type") || "text/html", lastModified: hg("last-modified") || null, xRobotsHeader: hg("x-robots-tag") || "" };
    } catch { return null; }
  };
  let renderedCount = 0;
  for (let i = 0; i < pagesToCrawl.length; i += effConc) {
    if (Date.now() > crawlDeadline) {
      result.crawlTruncated = true;   // ran out of time budget before finishing the list
      break;
    }
    const batch = pagesToCrawl.slice(i, i + effConc);
    const res   = await Promise.all(batch.map(async (u, bi) => {
      if (renderFetcher && (i + bi) < MAX_RENDER) {
        const pre = await renderPrefetch(u);
        if (pre) { renderedCount++; return auditPage(u, keywords, host, pre); }
      }
      return auditPage(u, keywords, host);   // raw (default, or fallback on a render failure)
    }));
    pages.push(...res);
  }
  if (renderFetcher) { try { await renderFetcher.close(); } catch { /* ignore */ } }
  result.crawlEngine  = useRendered ? "v2-rendered" : "v1-legacy";
  result.renderedCount = renderedCount;
  // Errored fetches (4xx/5xx, timeouts, non-HTML) come back as bare {url, error, ...}
  // with no metaTitle/H1/canonical/content. Left in, every one of them is counted as a
  // "missing title/desc/H1/canonical" page and drags avgWordCount/E-E-A-T down, so a few
  // 404s silently deflate the health score and inflate the "missing meta" percentages.
  // Only successfully-audited HTML pages are real deep-audited pages, so drop the rest
  // BEFORE any summary/health/average math (everything below reads this same `pages`).
  pages = pages.filter((p) => !p.error);

  result.pages     = pages;
  result.pageCount = pages.length;
  // Best estimate of the site's true size: prefer Google index, then sitemap,
  // then the number of pages we actually reached.
  result.totalPagesEstimate = Math.max(
    result.indexedPages || 0,
    result.sitemapUrlCount || 0,
    pages.length
  );

  // 5. Post-processing: duplicates, links, broken links
  result.duplicates  = detectDuplicates(pages);
  const { orphanPages } = buildLinkGraph(pages);
  result.orphanPages = orphanPages;

  // Broken links check (async, limited)
  try {
    result.brokenLinks = await checkBrokenLinks(pages, host);
  } catch { result.brokenLinks = []; }

  // 6. Summary aggregation
  const schemaTypeFreq  = {};
  const schemaTypeAll   = new Set();
  const issueFreq       = {};
  let   totalWords      = 0;
  let   eeatScoreTotal  = 0;

  // B9 — dedupe images-without-alt by src across pages so a shared template image (logo/header)
  // counts once, not once per crawled page. _noAltNoSrc holds non-alt images with no parseable src.
  const _noAltSrcSet = new Set();
  let _noAltNoSrc = 0;
  for (const p of pages) {
    if (!p.metaTitle)          result.summary.pagesMissingMetaTitle++;
    if (!p.metaDesc)           result.summary.pagesMissingMetaDesc++;
    if ((p.h1s||[]).length===0) result.summary.pagesMissingH1++;
    if ((p.h1s||[]).length > 1) result.summary.pagesMultipleH1++;
    if (p.multipleTitle)       result.summary.pagesMultipleTitle++;
    if (p.titleOutsideHead)    result.summary.pagesTitleOutsideHead++;
    if (p.multipleHead)        result.summary.pagesMultipleHead++;
    if (p.multipleBody)        result.summary.pagesMultipleBody++;
    if ((p.httpResourceCount||0) > 0) result.summary.pagesWithMixedContent++;
    if (p.isNoindex)           result.summary.pagesNoindex++;
    if (!p.canonical)          result.summary.pagesNoCanonical++;
    result.summary.totalImgsWithoutAlt  += p.imgsWithoutAlt  || 0;   // raw cross-page sum (kept as *Raw below)
    for (const s of (p.imgsWithoutAltSrcs || [])) _noAltSrcSet.add(s);
    _noAltNoSrc += Math.max(0, (p.imgsWithoutAlt || 0) - (p.imgsWithoutAltSrcs || []).length);
    result.summary.totalImgsMissingAltAttr += p.imgsMissingAltAttr || 0;
    result.summary.totalImgsMissingAltText += p.imgsMissingAltText || 0;
    result.summary.totalImgsWithoutDims += p.imgsWithoutDims || 0;
    if ((p.slug?.issues||[]).length > 0) result.summary.slugIssuesCount++;
    if ((p.content?.wordCount||0) < 200) result.summary.thinContentCount++;
    totalWords += p.content?.wordCount || 0;
    if ((p.social?.issues||[]).length > 0) result.summary.socialMissing++;
    if ((p.cwv||[]).length > 0) result.summary.cwvIssuesCount++;

    for (const s of p.schemas || []) {
      schemaTypeAll.add(s.type);
      schemaTypeFreq[s.type] = (schemaTypeFreq[s.type] || 0) + 1;
    }

    eeatScoreTotal += p.eeat?.score || 0;

    for (const issue of p.issues || []) {
      const key = issue.replace(/\d+/g, "N");
      issueFreq[key] = (issueFreq[key] || 0) + 1;
    }
  }

  // B9 — the HEADLINE image-alt figure is now the src-deduped count (template images counted once);
  // the raw per-page sum is kept as *Raw for reference.
  result.summary.totalImgsWithoutAltRaw    = result.summary.totalImgsWithoutAlt;
  result.summary.totalImgsWithoutAltUnique = _noAltSrcSet.size + _noAltNoSrc;
  result.summary.totalImgsWithoutAlt       = _noAltSrcSet.size + _noAltNoSrc;
  result.summary.pagesWithSchemaTypes = [...schemaTypeAll];
  result.summary.schemaTypes          = schemaTypeFreq;
  result.summary.avgWordCount         = pages.length > 0 ? Math.round(totalWords / pages.length) : 0;
  result.summary.commonIssues         = Object.entries(issueFreq)
    .sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([issue, count]) => ({ issue, count }));

  // E-E-A-T summary
  const avgEeat = pages.length > 0 ? (eeatScoreTotal / pages.length).toFixed(1) : 0;
  result.eeatSummary = {
    avgScore: Number(avgEeat),
    maxScore: pages[0]?.eeat?.maxScore || 9,
    signals: pages[0]?.eeat || {},
  };

  // 7. Health score
  result.healthScore = computeHealthScore(result);

  return result;
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function POST(request) {
  try {
    const body = await request.json();
    const { domain, keywords = [] } = body;
    if (!domain) return Response.json({ error: "domain required" }, { status: 400 });
    // 30-day persistent cache by domain (cross-user: a competitor crawl already done
    // for one user is reused for another). No-op if Mongo isn't configured.
    // dataType carries CRAWL_ENGINE_VERSION so a crawler-output change (new engine,
    // fixed check, threshold) misses the old cache and re-crawls, instead of serving
    // 30-day-stale crawl data. Report cache (report-key.js) already folds in the same
    // version; without this line the report busts but still reads the OLD crawl.
    const { data: result, cached } = await getOrFetch({
      domain, dataType: `crawl-${CRAWL_ENGINE_VERSION}`, ttlDays: 30, source: "crawl",
      fetchFn: () => crawlDomain(domain, keywords),
    });
    await logUsage({ domain, api: "crawl", costUSD: cached ? 0 : 0.02, cached });
    return Response.json(result);
  } catch (err) {
    console.error("[website-crawl] Error:", err);
    return Response.json({ error: err?.message || "crawl failed" }, { status: 500 });
  }
}
