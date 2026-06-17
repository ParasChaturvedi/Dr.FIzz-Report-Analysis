// src/app/api/seo/website-crawl/route.js
// Advanced domain crawler — v2
// Extracts: H1-H6 hierarchy, meta signals, schema depth, internal link graph,
// duplicate detection, Core Web Vitals hints, social meta, SERP preview,
// content quality, page speed hints, E-E-A-T signals, overall health score.

import { NextResponse } from "next/server";
import { getOrFetch } from "@/lib/cache/mongo";
import { logUsage } from "@/lib/cache/usage";

export const runtime    = "nodejs";
export const maxDuration = 90;

const FETCH_TIMEOUT_MS  = 10000;
const MAX_PAGES         = 50;     // pages we deep-audit (HTML parsed) — sample of the full index
const SITEMAP_SCAN_CAP  = 5000;   // sitemap URLs we count for the total estimate
const CONCURRENCY       = 5;

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
      for (const obj of arr) {
        const type = obj["@type"] || null;
        if (!type) continue;
        const props = {};
        for (const k of ["name","telephone","email","address","url","description","ratingValue","reviewCount","priceRange","openingHours","geo","sameAs"]) {
          if (obj[k] !== undefined) props[k] = typeof obj[k] === "object" ? JSON.stringify(obj[k]).slice(0, 80) : String(obj[k]).slice(0, 80);
        }
        schemas.push({ type, properties: props, propertyCount: Object.keys(obj).length - 1 });
      }
    } catch {
      const m = b.match(/"@type"\s*:\s*"([^"]+)"/);
      if (m) schemas.push({ type: m[1], properties: {}, propertyCount: 0 });
    }
  }
  return schemas;
}

// ── Core Web Vitals hints ─────────────────────────────────────────────────────
function cwvHints(html) {
  const hints = [];
  // LCP: large images without loading=eager (might be lazy = bad for LCP)
  const lazyHeroRisk = /loading=["']lazy["'][^>]*(?:class|id)=["'][^"']*(?:hero|banner|header|above)[^"']*["']/i.test(html)
    || /(?:class|id)=["'][^"']*(?:hero|banner|header)[^"']*["'][^>]*loading=["']lazy["']/i.test(html);
  if (lazyHeroRisk) hints.push({ type: "LCP", issue: "Hero/banner image may be lazy-loaded — can delay LCP", severity: "high" });

  // CLS: images without width+height attributes
  const imgs = [...html.matchAll(/<img\s([^>]*)>/gi)].map(m => m[1]);
  const imgsMissingDims = imgs.filter(a => !/width=/i.test(a) || !/height=/i.test(a)).length;
  if (imgsMissingDims > 0) hints.push({ type: "CLS", issue: `${imgsMissingDims} image(s) missing width/height — causes layout shift`, severity: imgsMissingDims > 3 ? "high" : "medium" });

  // FID/INP: many render-blocking scripts
  const blockingScripts = count(html, /<script(?!\s[^>]*(?:async|defer|type=["']module["']))[^>]*src=/gi);
  if (blockingScripts > 3) hints.push({ type: "FID/INP", issue: `${blockingScripts} render-blocking scripts — blocks main thread`, severity: "medium" });

  // Inline styles bloat
  const inlineStyles = count(html, /style=["'][^"']{100,}["']/gi);
  if (inlineStyles > 10) hints.push({ type: "CLS", issue: `${inlineStyles} elements with large inline styles`, severity: "low" });

  // Total script count
  const totalScripts = count(html, /<script/gi);
  if (totalScripts > 20) hints.push({ type: "INP", issue: `${totalScripts} total script tags — heavy JS payload`, severity: totalScripts > 40 ? "high" : "medium" });

  return hints;
}

// ── Social meta completeness ──────────────────────────────────────────────────
function socialMeta(html) {
  const og = {
    title:       first(html, /<meta\s[^>]*property=["']og:title["'][^>]*content=["']([^"']{1,200})["']/i),
    description: first(html, /<meta\s[^>]*property=["']og:description["'][^>]*content=["']([^"']{1,400})["']/i),
    image:       first(html, /<meta\s[^>]*property=["']og:image["'][^>]*content=["']([^"']{1,500})["']/i),
    type:        first(html, /<meta\s[^>]*property=["']og:type["'][^>]*content=["']([^"']{1,50})["']/i),
    url:         first(html, /<meta\s[^>]*property=["']og:url["'][^>]*content=["']([^"']{1,300})["']/i),
  };
  const twitter = {
    card:        first(html, /<meta\s[^>]*name=["']twitter:card["'][^>]*content=["']([^"']{1,50})["']/i),
    title:       first(html, /<meta\s[^>]*name=["']twitter:title["'][^>]*content=["']([^"']{1,200})["']/i),
    description: first(html, /<meta\s[^>]*name=["']twitter:description["'][^>]*content=["']([^"']{1,400})["']/i),
    image:       first(html, /<meta\s[^>]*name=["']twitter:image["'][^>]*content=["']([^"']{1,500})["']/i),
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
  return { ...signals, score, maxScore: Object.keys(signals).length - 1, missing };
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
  if (totalScripts > 25) hints.push(`${totalScripts} scripts — consider bundling/deferring`);
  if (totalStyles > 5)   hints.push(`${totalStyles} stylesheets — consider combining`);
  if (lazyImages < totalImages / 2 && totalImages > 3) hints.push(`Only ${lazyImages}/${totalImages} images use lazy loading`);
  if (nextGenImages === 0 && totalImages > 0) hints.push("No WebP/AVIF images found — serve next-gen formats");
  if (iframes > 3)       hints.push(`${iframes} iframes — may slow down page`);
  if (preloads === 0)    hints.push("No <link rel=preload> found — consider preloading critical assets");

  return { totalScripts, totalStyles, totalImages, lazyImages, nextGenImages, iframes, preloads, hints };
}

// ── Full page audit ───────────────────────────────────────────────────────────
async function auditPage(url, keywords = [], host = "") {
  let html = "";
  let statusCode = null;
  let lastModified = null;
  let contentType = null;
  let fetchError = null;

  try {
    const res = await timedFetch(url);
    statusCode  = res.status;
    lastModified = res.headers.get("last-modified") || null;
    contentType  = res.headers.get("content-type") || "";
    if (!res.ok) return { url, statusCode, error: `HTTP ${res.status}`, issues: [] };
    if (!contentType.includes("html")) return { url, statusCode, error: "Not HTML", issues: [] };
    html = await res.text();
  } catch (err) {
    return { url, statusCode, error: err?.message || "fetch failed", issues: [] };
  }

  const kws = keywords.map(k => String(k).toLowerCase());

  // Meta basics
  const metaTitle  = first(html, /<title[^>]*>([^<]{1,200})<\/title>/i);
  const metaDesc   =
    first(html, /<meta\s[^>]*name=["']description["'][^>]*content=["']([^"']{1,400})["']/i) ||
    first(html, /<meta\s[^>]*content=["']([^"']{1,400})["'][^>]*name=["']description["']/i);
  const canonical  =
    first(html, /<link\s[^>]*rel=["']canonical["'][^>]*href=["']([^"']*)["']/i) ||
    first(html, /<link\s[^>]*href=["']([^"']*)["'][^>]*rel=["']canonical["']/i);
  const robotsMeta =
    first(html, /<meta\s[^>]*name=["']robots["'][^>]*content=["']([^"']*)["']/i) ||
    first(html, /<meta\s[^>]*content=["']([^"']*)["'][^>]*name=["']robots["']/i) ||
    "index, follow";
  const isNoindex = /noindex/i.test(robotsMeta || "");
  const isNofollow = /nofollow/i.test(robotsMeta || "");
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
  const imgsWithoutAlt  = allImgs.filter(a => !(/alt=["'][^"']+["']/i.test(a)) || /alt=["']\s*["']/i.test(a)).length;
  const imgsWithoutDims = allImgs.filter(a => !/width=/i.test(a) || !/height=/i.test(a)).length;

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
  else if (h1s.length > 1)            issues.push(`Multiple H1 tags (${h1s.length}) — use only one`);
  if (kws.length > 0 && !h1HasKeyword) issues.push("H1 doesn't include a target keyword");

  if (imgsWithoutAlt > 0)             issues.push(`${imgsWithoutAlt} image(s) missing alt text`);
  if (imgsWithoutDims > 0)            issues.push(`${imgsWithoutDims} image(s) missing width/height (CLS risk)`);
  if (schemas.length === 0)           issues.push("No Schema.org structured data");
  if (isNoindex)                      issues.push("Page is noindex — won't appear in search results");
  if (!viewport)                      issues.push("No viewport meta tag — not mobile-friendly");
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
    imgsWithoutAlt, imgsWithoutDims,
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
      pagesNoindex:          0,
      pagesNoCanonical:      0,
      pagesWithSchemaTypes:  [],
      schemaTypes:           {},
      totalImgsWithoutAlt:   0,
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
      if (/^User-agent:\s*\*[\s\S]*?Disallow:\s*\/(?:\s|$)/m.test(txt))
        result.crawlBlockedByRobots = true;

      const sitemapHint = txt.match(/^Sitemap:\s*(https?:\/\/\S+)/im)?.[1]?.trim();
      if (sitemapHint) result.sitemapUrl = sitemapHint;
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
  //    Prefer sitemap URLs; if the sitemap is missing or thin, fall back to a
  //    breadth-first crawl of internal links so we don't report "1 page" for a
  //    site that actually has hundreds.
  let pagesToCrawl;
  const sitemapPages = sitemap.urls.filter(u => u !== base);
  if (sitemapPages.length >= 3) {
    pagesToCrawl = [base, ...sitemapPages].slice(0, MAX_PAGES);
    result.discoveryMethod = "sitemap";
  } else {
    // Seed BFS from homepage (+ any few sitemap URLs we did find)
    const discovered = await discoverViaLinks(base, host, [base, ...sitemapPages], MAX_PAGES);
    pagesToCrawl = discovered.length > 1 ? discovered : [base];
    result.discoveryMethod = discovered.length > 1 ? "links" : "homepage-only";
  }

  // 4. Crawl with concurrency
  const pages = [];
  for (let i = 0; i < pagesToCrawl.length; i += CONCURRENCY) {
    const batch = pagesToCrawl.slice(i, i + CONCURRENCY);
    const res   = await Promise.all(batch.map(u => auditPage(u, keywords, host)));
    pages.push(...res);
  }

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

  for (const p of pages) {
    if (!p.metaTitle)          result.summary.pagesMissingMetaTitle++;
    if (!p.metaDesc)           result.summary.pagesMissingMetaDesc++;
    if ((p.h1s||[]).length===0) result.summary.pagesMissingH1++;
    if ((p.h1s||[]).length > 1) result.summary.pagesMultipleH1++;
    if (p.isNoindex)           result.summary.pagesNoindex++;
    if (!p.canonical)          result.summary.pagesNoCanonical++;
    result.summary.totalImgsWithoutAlt  += p.imgsWithoutAlt  || 0;
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
    if (!domain) return NextResponse.json({ error: "domain required" }, { status: 400 });
    // 30-day persistent cache by domain (cross-user: a competitor crawl already done
    // for one user is reused for another). No-op if Mongo isn't configured.
    const { data: result, cached } = await getOrFetch({
      domain, dataType: "crawl", ttlDays: 30, source: "crawl",
      fetchFn: () => crawlDomain(domain, keywords),
    });
    await logUsage({ domain, api: "crawl", costUSD: cached ? 0 : 0.02, cached });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[website-crawl] Error:", err);
    return NextResponse.json({ error: err?.message || "crawl failed" }, { status: 500 });
  }
}
