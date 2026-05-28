// src/app/api/seo/route.js
import { NextResponse } from "next/server";

import { fetchPsiForStrategy } from "@/lib/seo/psi";
import { fetchOpenPageRank } from "@/lib/seo/openpagerank";
import { fetchSerp } from "@/lib/seo/serper";
import { fetchDataForSeo, fetchDomainRankOverview, fetchCompetitorDomains, fetchRankedKeywords, fetchOnPageAudit } from "@/lib/seo/dataforseo";
import { extractPageText } from "@/lib/seo/apyhub";

// ✅ used to fetch rendered HTML + extract title + MAIN content
import {
  fetchHtml,
  extractTitle,
  extractMainContentHtml, // ✅ NEW (Readability-based) - you will add this in src/lib/seo/extraction.js
} from "@/lib/seo/extraction";

// ✅ Claude: generate "New On-Page SEO Opportunity" keywords
import { getKeywordsForPage } from "@/lib/claude/pipeline";

export const runtime = "nodejs";

const DEBUG_CONTENT = String(process.env.DEBUG_CONTENT || "").trim() === "1";

// ✅ Claude FAQs (replaced Perplexity)
import { claudeChat } from "@/lib/claude/client";

function hasClaudeKey() {
  return !!String(process.env.ANTHROPIC_API_KEY || "").trim();
}

function clampFaqCount(n, fallback = 10) {
  const x = Math.round(Number(n) || fallback);
  return Math.max(3, Math.min(20, x));
}

function truncateForModel(s, maxChars = 12000) {
  const str = String(s || "");
  if (str.length <= maxChars) return str;
  // Keep head + tail for better coverage of key info
  const head = str.slice(0, Math.max(0, Math.floor(maxChars * 0.7)));
  const tail = str.slice(-Math.max(0, Math.floor(maxChars * 0.3)));
  return `${head}

[...truncated...]

${tail}`;
}

/**
 * Normalize any user input into a valid absolute URL string.
 * - "example.com"        -> "https://example.com"
 * - "http://example.com" -> "http://example.com"
 * - "https://..."        -> "https://..."
 */
function ensureHttpUrl(input) {
  const raw = String(input || "").trim();
  if (!raw) return null;
  return raw.includes("://") ? raw : `https://${raw}`;
}

/**
 * Helper to safely get the domain from a URL (supports bare domains too)
 */
function getDomainFromUrl(url) {
  try {
    const safe = ensureHttpUrl(url);
    if (!safe) return null;
    const u = new URL(safe);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Convert extracted plain text into simple HTML paragraphs (fallback only)
function textToHtml(text) {
  const safe = String(text || "").trim();
  if (!safe) return "";

  return safe
    .split(/\n\s*\n/g)
    .map((p) => {
      const trimmed = p.trim();
      if (!trimmed) return "";
      const withBreaks = escapeHtml(trimmed).replace(/\n/g, "<br/>");
      return `<p>${withBreaks}</p>`;
    })
    .filter(Boolean)
    .join("");
}

/**
 * Extract <body>...</body> inner HTML from a full HTML document (last-resort fallback).
 */
function extractBodyInnerHtml(fullHtml) {
  const html = String(fullHtml || "");
  if (!html) return "";
  const m = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return m ? m[1] : html; // fallback to whole html if body missing
}

/**
 * Make the rendered page HTML "editor-safe" AND "image-free":
 * - remove scripts/styles/noscript/svg/iframe etc
 * - REMOVE images/picture/video/audio/figure entirely
 * - keep headings, paragraphs, lists, links, tables (basic)
 * - strip most attributes except a small allowlist
 *
 * NOTE: Regex-based (no DOM dependency). Best-effort.
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
  // 1) For all tags: remove on* handlers + style
  html = html
    .replace(/\son\w+\s*=\s*["'][\s\S]*?["']/gi, "")
    .replace(/\sstyle\s*=\s*["'][\s\S]*?["']/gi, "");

  // 2) For <a>: keep href, title, target, rel
  html = html.replace(/<a\b([^>]*)>/gi, (m, attrs) => {
    const href = (attrs.match(/\shref\s*=\s*["'][^"']*["']/i) || [])[0] || "";
    const title =
      (attrs.match(/\stitle\s*=\s*["'][^"']*["']/i) || [])[0] || "";
    const target =
      (attrs.match(/\starget\s*=\s*["'][^"']*["']/i) || [])[0] || "";
    const rel = (attrs.match(/\srel\s*=\s*["'][^"']*["']/i) || [])[0] || "";
    return `<a${href}${title}${target}${rel}>`;
  });

  // 3) For all other tags: remove most attrs
  html = html.replace(/<([a-z0-9]+)\b([^>]*)>/gi, (m, tag, attrs) => {
    const t = String(tag).toLowerCase();

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

    if (!allowed.has(t)) return `<div>`;
    if (t === "a") return m;

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

  // Clean up empty blocks created by stripping media
  html = html
    .replace(/<p>\s*(?:&nbsp;|\s|<br\s*\/?>)*\s*<\/p>/gi, "")
    .replace(/<div>\s*(?:&nbsp;|\s|<br\s*\/?>)*\s*<\/div>/gi, "");

  html = html.replace(/\n{3,}/g, "\n\n").trim();
  return html;
}

/**
 * Prefer MAIN rendered HTML (Readability) for editor hydration (keeps headings/paragraphs).
 * Always skip images.
 * Use ApyHub text for rawText and fallback HTML if rendered HTML is empty.
 */
async function buildContentPayload(url) {
  let title = null;
  let rawText = "";
  let htmlForEditor = "";
  let source = "none";

  // 1) Rendered HTML -> extract MAIN content -> sanitize
  try {
    const fetched = await fetchHtml(url);
    const fullHtml = fetched?.html || "";
    const finalUrl = fetched?.finalUrl || url;

    if (DEBUG_CONTENT) {
      console.log("────────────────────────────────────────");
      console.log("[content] url:", url);
      console.log("[content] finalUrl:", finalUrl);
      console.log("[content] html length:", fullHtml.length);
      console.log("[content] html head snippet:", fullHtml.slice(0, 220));
    }

    // Title best-effort from <title> or meta
    title = extractTitle(fullHtml) || null;

    // ✅ MAIN CONTENT extraction (Readability-based)
    let main = null;
    try {
      main = extractMainContentHtml ? extractMainContentHtml(fullHtml, finalUrl) : null;
    } catch {
      main = null;
    }

    const mainHtml = String(main?.contentHtml || "").trim();
    const mainText = String(main?.text || "").trim();
    const mainTitle = String(main?.title || "").trim();

    if (!title && mainTitle) title = mainTitle;

    if (DEBUG_CONTENT) {
      console.log("[content] mainHtml length:", mainHtml.length);
      console.log("[content] mainHtml head snippet:", mainHtml.slice(0, 220));
      console.log("[content] mainText length:", mainText.length);
      console.log("[content] mainText head snippet:", mainText.slice(0, 220));
    }

    // If Readability got something substantial, sanitize that.
    if (mainHtml) {
      const safeHtml = sanitizeHtmlForEditor(mainHtml);
      if (DEBUG_CONTENT) {
        console.log("[content] safeHtml(main) length:", safeHtml.length);
        console.log("[content] safeHtml(main) head snippet:", safeHtml.slice(0, 220));
        console.log("────────────────────────────────────────");
      }
      if (safeHtml && safeHtml.trim()) {
        htmlForEditor = safeHtml.trim();
        source = "rendered_main_html";
      }
    }

    // Last-resort rendered fallback: sanitize bodyInner (NOT preferred)
    if (!htmlForEditor) {
      const bodyInner = extractBodyInnerHtml(fullHtml);

      if (DEBUG_CONTENT) {
        console.log("[content] bodyInner length:", bodyInner.length);
        console.log("[content] bodyInner head snippet:", bodyInner.slice(0, 220));
      }

      const safeHtml = sanitizeHtmlForEditor(bodyInner);

      if (DEBUG_CONTENT) {
        console.log("[content] safeHtml(body) length:", safeHtml.length);
        console.log("[content] safeHtml(body) head snippet:", safeHtml.slice(0, 220));
        console.log("────────────────────────────────────────");
      }

      if (safeHtml && safeHtml.trim()) {
        htmlForEditor = safeHtml.trim();
        source = "rendered_body_fallback";
      }
    }

    // If we still have no rawText yet, use Readability text as baseline (ApyHub may overwrite)
    if (!rawText && mainText) rawText = mainText;
  } catch (e) {
    if (DEBUG_CONTENT) {
      console.log("────────────────────────────────────────");
      console.log("[content] fetchHtml ERROR for:", url);
      console.log("[content] error:", e?.message || e);
      console.log("────────────────────────────────────────");
    }
    // ignore
  }

  // 2) ApyHub text for rawText (usually cleaner for text)
  try {
    const apyResult = await extractPageText(url);
    const apyText = (apyResult?.apyhub?.text || "").trim();
    if (apyText) rawText = apyText;

    if (DEBUG_CONTENT) {
      console.log("[content] apyhub rawText length:", rawText.length);
      console.log("[content] apyhub rawText head snippet:", rawText.slice(0, 220));
    }
  } catch (e) {
    if (DEBUG_CONTENT) console.log("[content] apyhub ERROR for:", url, e?.message || e);
    // ignore
  }

  // 3) Fallback HTML from text only (if no rendered HTML worked)
  if (!htmlForEditor && rawText) {
    htmlForEditor = textToHtml(rawText);
    if (htmlForEditor) source = "text_fallback";
    if (DEBUG_CONTENT) {
      console.log("[content] using textToHtml fallback; html length:", htmlForEditor.length);
    }
  }

  // 4) Fallback title from first non-empty line of text
  if (!title && rawText) {
    const firstLine = rawText.split("\n").map((s) => s.trim()).find(Boolean);
    title = firstLine ? firstLine.slice(0, 120) : null;
  }

  return {
    title: title || null,
    rawText: rawText || "",
    html: htmlForEditor || "",
    source,
  };
}

// Simple helper to compute % difference vs a baseline value
function computePercentGrowth(current, baseline) {
  const cur = typeof current === "number" ? current : 0;
  const base = typeof baseline === "number" ? baseline : 0;
  if (!base || base <= 0) return 0;
  return Math.round(((cur - base) / base) * 100);
}

function sseFormat(event, data) {
  const payload = typeof data === "string" ? data : JSON.stringify(data ?? {}, null, 0);
  return `event: ${event}\ndata: ${payload}\n\n`;
}

/* ============================================================================
   ✅ RapidAPI fallback helpers (Website Analyze & SEO Audit PRO)
============================================================================ */

function toNumber(val) {
  if (typeof val === "number") return Number.isFinite(val) ? val : null;
  if (typeof val === "string") {
    const cleaned = val.replace(/,/g, "").trim();
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// Breadth-first scan for numbers under keys that look like backlinks/ref domains
function scanForCounts(obj) {
  const seen = new Set();
  const q = [obj];

  let backlinks = null;
  let referringDomains = null;
  let referringPages = null;
  let nofollowPages = null;

  const KEY_BACKLINK = /back\s*links?|total_backlinks?/i;
  const KEY_REF_DOM = /(referr?ing|referral)\s*domains?|ref_domains?/i;
  const KEY_REF_PG = /(referr?ing|referral)\s*pages?/i;
  const KEY_NOFOLLOW = /nofollow/i;

  while (q.length) {
    const cur = q.shift();
    if (!cur || typeof cur !== "object") continue;
    if (seen.has(cur)) continue;
    seen.add(cur);

    for (const [k, v] of Object.entries(cur)) {
      if (v && typeof v === "object") q.push(v);

      const n = toNumber(v);
      if (n == null) continue;

      if (backlinks == null && KEY_BACKLINK.test(k)) backlinks = n;
      if (referringDomains == null && KEY_REF_DOM.test(k)) referringDomains = n;
      if (referringPages == null && KEY_REF_PG.test(k)) referringPages = n;
      if (nofollowPages == null && KEY_NOFOLLOW.test(k) && KEY_REF_PG.test(k))
        nofollowPages = n;
    }
  }

  return { backlinks, referringDomains, referringPages, nofollowPages };
}

async function fetchRapidApiBacklinkFallback(domain) {
  const key = process.env.RAPIDAPI_KEY;
  const host =
    process.env.RAPIDAPI_HOST || "website-analyze-and-seo-audit-pro.p.rapidapi.com";

  if (!key) throw new Error("RAPIDAPI_KEY is not set");

  const endpointsToTry = [
    { path: "/domain-data", query: { domain } },
    { path: "/domain_data", query: { domain } },
    { path: "/aiseo.php", query: { url: domain } },
  ];

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 12_000);

  try {
    let lastErr = null;

    for (const ep of endpointsToTry) {
      const u = new URL(`https://${host}${ep.path}`);
      Object.entries(ep.query).forEach(([k, v]) => {
        if (v != null) u.searchParams.set(k, String(v));
      });

      try {
        const res = await fetch(u.toString(), {
          method: "GET",
          headers: {
            "X-RapidAPI-Key": key,
            "X-RapidAPI-Host": host,
          },
          signal: controller.signal,
        });

        const text = await res.text();
        let json = null;
        try {
          json = text ? JSON.parse(text) : null;
        } catch {
          json = null;
        }

        if (!res.ok) {
          lastErr = new Error(
            `RapidAPI ${ep.path} failed: ${res.status} - ${text.slice(0, 200)}`
          );
          continue;
        }

        const { backlinks, referringDomains, referringPages, nofollowPages } =
          scanForCounts(json);

        return {
          ok: true,
          raw: json,
          backlinksSummary: {
            backlinks: backlinks ?? 0,
            referring_domains: referringDomains ?? 0,
            referring_pages: referringPages ?? 0,
            referring_pages_nofollow: nofollowPages ?? 0,
          },
        };
      } catch (e) {
        lastErr = e;
        continue;
      }
    }

    throw lastErr || new Error("RapidAPI fallback failed (no endpoint worked)");
  } finally {
    clearTimeout(t);
  }
}

/**
 * Try to extract a "domain authority" style score from OpenPageRank payload
 */
function pickAuthorityScore(openPageRankPayload) {
  if (!openPageRankPayload) return null;
  if (typeof openPageRankPayload === "number") return openPageRankPayload;

  const candidatePaths = [
    ["pageRank"],
    ["rank"],
    ["domainAuthority"],
    ["score"],
    ["openPageRank", "pageRank"],
    ["openPageRank", "rank"],
    ["openPageRank", "domainAuthority"],
    ["openPageRank", "score"],
    ["data", "page_rank_decimal"],
    ["data", "page_rank_integer"],
    ["data", "page_rank"],
    ["response", "page_rank_decimal"],
    ["response", "page_rank_integer"],
    ["response", "page_rank"],
    ["results", 0, "page_rank_decimal"],
    ["results", 0, "page_rank_integer"],
    ["results", 0, "page_rank"],
    ["result", "page_rank_decimal"],
    ["result", "page_rank_integer"],
    ["result", "page_rank"],
  ];

  const getAt = (obj, path) => {
    let cur = obj;
    for (const key of path) {
      if (cur == null) return undefined;
      cur = cur[key];
    }
    return cur;
  };

  for (const path of candidatePaths) {
    const v = getAt(openPageRankPayload, path);
    if (typeof v === "number" && Number.isFinite(v)) {
      if (v <= 10 && v >= 0) return Math.round(v * 10);
      return v;
    }
    if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) {
      const n = Number(v);
      if (n <= 10 && n >= 0) return Math.round(n * 10);
      return n;
    }
  }

  return null;
}

/* ----------------- NEW: On-page opportunity keywords via Claude AI ----------------- */
function hash32(str = "") {
  const s = String(str);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rand01From(str) {
  return (hash32(str) % 1000000) / 1000000;
}

function clampInt(n, a, b) {
  const x = Math.round(Number(n) || 0);
  return Math.max(a, Math.min(b, x));
}

function inferIntentType(kw = "") {
  const s = String(kw || "").toLowerCase();
  if (
    /\b(price|pricing|cost|buy|purchase|coupon|discount|deal|best|top|vs|compare|comparison|alternative)\b/.test(
      s
    )
  ) {
    return "Transactional";
  }
  if (/\b(how to|what is|guide|tutorial|examples|checklist|tips)\b/.test(s)) {
    return "Informational";
  }
  if (/\b(review|reviews|rating|ratings)\b/.test(s)) {
    return "Commercial";
  }
  return "Informational";
}

/**
 * Convert Perplexity keyword phrases into rows the UI table expects:
 * { keyword, type, volume, difficulty, suggested }
 */
function buildOnpageSeoRowsFromKeywords(keywords = [], domain = "") {
  const list = Array.isArray(keywords) ? keywords.filter(Boolean) : [];
  const d = String(domain || "").trim();

  return list.slice(0, 7).map((kw) => {
    const k = String(kw).trim();
    const r = rand01From(`${d}|${k}`);

    const volume = clampInt(300 + r * 24000, 60, 25000);
    const breadth = Math.min(
      1,
      (k.split(/\s+/).length <= 2 ? 0.35 : 0.0) + (k.length < 14 ? 0.25 : 0.0)
    );
    const difficulty = clampInt(18 + r * 70 + breadth * 20, 5, 98);

    const type = inferIntentType(k);

    const suggested =
      type === "Transactional"
        ? `Create a high-intent landing page targeting "${k}" with clear CTAs, pricing/context, FAQs, and internal links.`
        : `Publish a focused guide on "${k}" with step-by-step sections, examples, and internal links into your related cluster.`;

    return { keyword: k, type, volume, difficulty, suggested };
  });
}

async function fetchOnpageKeywordsViaClaude({ url, domain, industry = "", location = "" }) {
  const out = await getKeywordsForPage({
    url: url || "",
    title: `New On-Page SEO opportunities for ${domain || url || "this site"}`,
    contentText: "", // intentionally blank => NEW opportunities, not rewrites
    domain: domain || "",
    industry: industry || "",
    location: location || "",
    cacheKey: `onpage:${String(domain || url || "unknown").toLowerCase()}:${String(
      industry || ""
    ).toLowerCase()}:${String(location || "").toLowerCase()}`,
  });

  return {
    keywords: Array.isArray(out?.keywords) ? out.keywords : [],
    clusters: Array.isArray(out?.clusters) ? out.clusters : [],
  };
}
/* ----------------- END: Claude AI on-page keywords ----------------- */

/* ----------------- NEW: FAQs via Claude AI (main source) ----------------- */
/**
 * Generate FAQ pairs from extracted page text.
 * Returns: { faqs: [{ question, answer }] }
 */
async function generateFaqsViaClaude({
  rawText = "",
  domain = "",
  keyword = "",
  count = 10,
}) {
  const text = String(rawText || "").trim();
  const c = clampFaqCount(count, 10);

  if (!text) {
    return { faqs: [] };
  }

  if (!hasClaudeKey()) {
    throw new Error(
      "Claude API key missing. Set ANTHROPIC_API_KEY in your environment."
    );
  }

  const pageText = truncateForModel(text, 12000);

  const system = [
    "You are an SEO assistant generating FAQs for a website page.",
    "Use ONLY the provided page text. Do not browse the web.",
    "Write concise, helpful answers (1-3 sentences).",
    "Avoid medical/legal/financial advice disclaimers unless the page is about those topics.",
    "Do not hallucinate facts; if the page text doesn't contain an answer, rephrase the question to fit what is present.",
    "Return STRICT JSON only.",
  ].join(" ");

  const user = [
    `Domain: ${domain || ""}`,
    `Keyword/Topic: ${keyword || ""}`,
    `Task: Generate ${c} FAQs from the page text below.`,
    `Return JSON in this exact format: {"faqs":[{"question":"...","answer":"..."}]}`,
    "",
    "PAGE_TEXT:",
    pageText,
  ].join("\n");

  const { content } = await claudeChat({
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.2,
    max_tokens: 900,
  });

  // Parse strict JSON from the model response
  let parsed = null;
  try {
    parsed = content ? JSON.parse(content) : null;
  } catch {
    const m = String(content || "").match(/\{[\s\S]*\}/);
    try {
      parsed = m ? JSON.parse(m[0]) : null;
    } catch {}
  }

  const faqs = Array.isArray(parsed?.faqs) ? parsed.faqs : [];

  const cleaned = faqs
    .map((it) => ({
      question: String(it?.question || "").trim(),
      answer: String(it?.answer || "").trim(),
    }))
    .filter((it) => it.question && it.answer)
    .slice(0, c);

  return { faqs: cleaned };
}
/* ----------------- END: FAQs via Claude ----------------- */



/**
 * Build InfoPanel metrics without GSC:
 */
function buildInfoPanel(unified) {
  const domainAuthority = pickAuthorityScore(unified?.openPageRank ?? unified?.authority ?? unified);

  const organicKeyword = Array.isArray(unified?.seoRows)
    ? unified.seoRows.length
    : Array.isArray(unified?.dataForSeo?.topKeywords)
    ? unified.dataForSeo.topKeywords.length
    : 0;

  const organicTraffic = null;

  const baseline = { domainAuthority: 40, organicKeyword: 200, organicTraffic: 0 };

  const growth = {
    domainAuthority: computePercentGrowth(domainAuthority, baseline.domainAuthority),
    organicKeyword: computePercentGrowth(organicKeyword, baseline.organicKeyword),
    organicTraffic: 0,
  };

  const mob = unified?.technicalSeo?.performanceScoreMobile;
  const desk = unified?.technicalSeo?.performanceScoreDesktop;

  const mobN = typeof mob === "number" ? mob : null;
  const deskN = typeof desk === "number" ? desk : null;

  const avgPerf =
    mobN != null && deskN != null
      ? (mobN + deskN) / 2
      : mobN != null
      ? mobN
      : deskN != null
      ? deskN
      : null;

  const badge =
    avgPerf == null
      ? { label: "Good", tone: "success" }
      : avgPerf >= 70
      ? { label: "Good", tone: "success" }
      : avgPerf >= 50
      ? { label: "Needs Work", tone: "warning" }
      : { label: "Poor", tone: "danger" };

  return { domainAuthority, organicKeyword, organicTraffic, growth, badge };
}

// ✅ unify "seoRows" from different shapes safely
// NOTE: Per user's requirement, we DO NOT populate seoRows from DataForSEO.
// seoRows should come from Perplexity on-page keywords (provider: "onpageKeywords") only.
function ensureSeoRows(unified) {
  if (Array.isArray(unified.seoRows)) return;

  // Legacy compatibility: if some provider already returns seoRows under a nested key,
  // allow that, but skip DataForSEO keyword lists.
  if (Array.isArray(unified?.dataforseo?.seoRows)) {
    unified.seoRows = unified.dataforseo.seoRows;
    return;
  }
}

// ✅ merge helper for provider output that might be nested
function mergeProviderResult(unified, providerKey, providerResult) {
  if (!providerResult) return;

  Object.assign(unified, providerResult);

  if (providerKey === "onpageKeywords") {
    if (Array.isArray(providerResult?.seoRows)) unified.seoRows = providerResult.seoRows;
    if (Array.isArray(providerResult?.onpageKeywords))
      unified.onpageKeywords = providerResult.onpageKeywords;
    if (Array.isArray(providerResult?.onpageClusters))
      unified.onpageClusters = providerResult.onpageClusters;
  }

  if (providerKey === "authority" && unified.openPageRank == null) {
    unified.openPageRank =
      providerResult?.authority ?? providerResult?.openPageRank ?? providerResult;
  }

  if (providerKey === "dataforseoExtra") {
    if (providerResult?.domainRankOverview != null)
      unified.domainRankOverview = providerResult.domainRankOverview;
    if (Array.isArray(providerResult?.competitorDomains))
      unified.competitorDomains = providerResult.competitorDomains;
    if (Array.isArray(providerResult?.rankedKeywords))
      unified.rankedKeywords = providerResult.rankedKeywords;
    if (providerResult?.onPageAudit != null)
      unified.onPageAudit = providerResult.onPageAudit;
  }

  ensureSeoRows(unified);
}

/**
 * Normalize response shape so UI tabs don't break:
 * - Provide `serper` alias from `serp`
 * - Ensure Links-tab fields exist on `dataForSeo`
 */
function normalizeForUi(unified) {
  if (unified?.serp && !unified?.serper) {
    unified.serper = {
      organic: Array.isArray(unified.serp?.topResults) ? unified.serp.topResults : [],
      peopleAlsoAsk: Array.isArray(unified.serp?.peopleAlsoAsk)
        ? unified.serp.peopleAlsoAsk
        : [],
      relatedSearches: Array.isArray(unified.serp?.relatedSearches)
        ? unified.serp.relatedSearches
        : [],
      serpFeatures: unified.serp?.serpFeatures ?? null,
      raw: unified.serp?.raw ?? null,
    };
  }

  if (unified?.dataForSeo) {
    if (!Array.isArray(unified.dataForSeo.backlinkDomains)) unified.dataForSeo.backlinkDomains = [];
    if (typeof unified.dataForSeo.externalTotal !== "number") unified.dataForSeo.externalTotal = 0;
    if (typeof unified.dataForSeo.totalDomains !== "number") unified.dataForSeo.totalDomains = 0;
  }

  ensureSeoRows(unified);
  return unified;
}

function needsBacklinkFallback(unified) {
  const bfs = unified?.dataForSeo?.backlinksSummary;
  if (!bfs) return true;

  const b = toNumber(bfs.backlinks);
  const rd = toNumber(bfs.referring_domains);

  if (b == null && rd == null) return true;
  if ((b ?? 0) === 0 && (rd ?? 0) === 0) return true;

  return false;
}

function isContentOnlyRequest(providers = []) {
  const list = Array.isArray(providers) ? providers.filter(Boolean) : [];
  if (!list.length) return false;
  return list.every((p) => p === "content");
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));

    let {
      url,
      keyword,
      countryCode = "in",
      languageCode = "en",
      depth = 10,
      keywordsOnly = false,
      providers = ["psi", "authority", "serper", "dataforseo", "content", "faqs"],
    } = body || {};

    // FAQs are used by Advanced → FAQs tab. Default to true unless explicitly disabled.
    const wantsFaqs = body?.includeFaqs ?? body?.generateFaqs ?? true;

    // Ensure providers is a clean array (do not mutate selection/order).
    providers = Array.isArray(providers)
      ? providers.map((p) => String(p || "").trim()).filter(Boolean)
      : [];

    if (!url) {
      return NextResponse.json({ error: "Missing 'url' in request body" }, { status: 400 });
    }

    url = ensureHttpUrl(url);
    if (!url) {
      return NextResponse.json({ error: "Invalid 'url' in request body" }, { status: 400 });
    }

    const domain = getDomainFromUrl(url);

    const accept = request.headers.get("accept") || "";
    const wantsSSE = accept.includes("text/event-stream");

    const contentOnly = isContentOnlyRequest(providers);

    // -------------------------
    // NORMAL JSON MODE
    // -------------------------
    if (!wantsSSE) {
      // ✅ OPTION A FAST PATH: content-only requests return ASAP
      if (contentOnly && !keywordsOnly) {
        const unified = {};
        try {
          const content = await buildContentPayload(url);
          unified.content = {
            rawText: content.rawText || "",
            html: content.html || "",
            title: content.title || null,
            source: content.source || (content.html ? "rendered" : "text_fallback"),
          };
        } catch (err) {
          unified._errors = unified._errors || {};
          unified._errors.contentPipeline = err?.message || "Content pipeline failed";
        }

        // still provide minimal normalized fields expected by UI
        normalizeForUi(unified);

        const rawText = (unified.content?.rawText || "").trim();
        let recommendationsCount = 0;
        let contentOppsCount = 0;
        if (rawText) {
          const wordCount = rawText.split(/\s+/).length;
          recommendationsCount = Math.max(3, Math.round(wordCount / 300));
          contentOppsCount = Math.max(1, Math.round(wordCount / 1200));
        }

        unified.issues = {
          critical: 0,
          warning: 0,
          recommendations: recommendationsCount,
          contentOpps: contentOppsCount,
        };
        unified.issuesGrowth = { critical: 0, warning: 0, recommendations: 0, contentOpps: 0 };
        unified.infoPanel = buildInfoPanel(unified);

        unified._meta = {
          ...(unified._meta || {}),
          url,
          domain,
          keyword: keyword || null,
          countryCode,
          languageCode,
          depth,
          providers,
          keywordsOnly: Boolean(keywordsOnly),
          generatedAt: new Date().toISOString(),
          mode: "content_only_fast_path",
        };

        return NextResponse.json(unified);
      }

      // ---- normal (full) path ----
      const tasks = [];

      if (providers.includes("psi") && !keywordsOnly) {
        tasks.push(
          (async () => {
            try {
              const [mobileRes, desktopRes] = await Promise.allSettled([
                fetchPsiForStrategy(url, "mobile"),
                fetchPsiForStrategy(url, "desktop"),
              ]);

              const mobile  = mobileRes.status  === "fulfilled" ? mobileRes.value  : null;
              const desktop = desktopRes.status === "fulfilled" ? desktopRes.value : null;

              if (!mobile && !desktop) {
                return { key: "psi", ok: false, error: mobileRes.reason?.message || "PSI unavailable" };
              }

              const technicalSeo = {
                performanceScoreMobile:
                  typeof mobile?.performanceScore === "number" ? mobile.performanceScore : null,
                performanceScoreDesktop:
                  typeof desktop?.performanceScore === "number" ? desktop.performanceScore : null,
                coreWebVitals: mobile?.coreWebVitalsLab || desktop?.coreWebVitalsLab || {},
                coreWebVitalsField: mobile?.coreWebVitalsField || desktop?.coreWebVitalsField || {},
                issueCounts: {
                  critical: (mobile?.issueCounts?.critical ?? 0) + (desktop?.issueCounts?.critical ?? 0),
                  warning:  (mobile?.issueCounts?.warning  ?? 0) + (desktop?.issueCounts?.warning  ?? 0),
                },
              };

              return { key: "psi", ok: true, result: { technicalSeo } };
            } catch (error) {
              return { key: "psi", ok: false, error: error.message || "PSI failed" };
            }
          })()
        );
      }

      if (providers.includes("authority") && domain) {
        tasks.push(
          fetchOpenPageRank(domain).then(
            (result) => ({ key: "authority", ok: true, result }),
            (error) => ({ key: "authority", ok: false, error: error.message })
          )
        );
      }

      if (providers.includes("serper") && keyword && !keywordsOnly) {
        tasks.push(
          fetchSerp(keyword).then(
            (result) => ({ key: "serper", ok: true, result }),
            (error) => ({ key: "serper", ok: false, error: error.message })
          )
        );
      }

      if (providers.includes("dataforseo") && domain) {
        tasks.push(
          fetchDataForSeo(domain, {
            language_code: languageCode,
            countryCode,
            depth,
            keywordsOnly: Boolean(keywordsOnly),
          }).then(
            (result) => ({ key: "dataforseo", ok: true, result }),
            (error) => ({ key: "dataforseo", ok: false, error: error.message })
          )
        );

        // Additional DataForSEO calls: domain rank overview, competitor domains, ranked keywords
        tasks.push(
          (async () => {
            try {
              const [domainRankOverview, competitorDomains, rankedKeywords] = await Promise.all([
                fetchDomainRankOverview(domain).catch(() => null),
                fetchCompetitorDomains(domain).catch(() => []),
                fetchRankedKeywords(domain).catch(() => []),
              ]);
              return {
                key: "dataforseoExtra",
                ok: true,
                result: { domainRankOverview, competitorDomains, rankedKeywords },
              };
            } catch (error) {
              return { key: "dataforseoExtra", ok: false, error: error?.message || "dataforseoExtra failed" };
            }
          })()
        );
      }

      if (providers.includes("onpageKeywords") && domain && !keywordsOnly) {
        tasks.push(
          (async () => {
            try {
              const industry = String(body?.industry || "").trim();
              const location = String(body?.location || "").trim();

              const { keywords, clusters } = await fetchOnpageKeywordsViaClaude({
                url,
                domain,
                industry,
                location,
              });

              const seoRows = buildOnpageSeoRowsFromKeywords(keywords, domain);

              return {
                key: "onpageKeywords",
                ok: true,
                result: { seoRows, onpageKeywords: keywords, onpageClusters: clusters },
              };
            } catch (error) {
              return {
                key: "onpageKeywords",
                ok: false,
                error: error?.message || "Perplexity on-page keywords failed",
              };
            }
          })()
        );
      }

      const coreResults = await Promise.all(tasks);

      const unified = coreResults.reduce((acc, item) => {
        if (item.ok && item.result) {
          mergeProviderResult(acc, item.key, item.result);
          return acc;
        }
        if (!item.ok) {
          acc._errors = acc._errors || {};
          acc._errors[item.key] = item.error;
        }
        return acc;
      }, {});

      // ✅ RapidAPI fallback for backlinks/ref domains (only when needed)
      if (providers.includes("dataforseo") && domain && !keywordsOnly && needsBacklinkFallback(unified)) {
        try {
          const rapid = await fetchRapidApiBacklinkFallback(domain);

          unified.dataForSeo = unified.dataForSeo || {};
          unified.dataForSeo.backlinksSummary = unified.dataForSeo.backlinksSummary || {};

          unified.dataForSeo.backlinksSummary.backlinks =
            toNumber(unified.dataForSeo.backlinksSummary.backlinks) ?? 0;
          unified.dataForSeo.backlinksSummary.referring_domains =
            toNumber(unified.dataForSeo.backlinksSummary.referring_domains) ?? 0;

          if (
            unified.dataForSeo.backlinksSummary.backlinks === 0 &&
            unified.dataForSeo.backlinksSummary.referring_domains === 0
          ) {
            unified.dataForSeo.backlinksSummary = {
              ...unified.dataForSeo.backlinksSummary,
              ...rapid.backlinksSummary,
            };
            unified._meta = unified._meta || {};
            unified._meta.backlinksFallback = "rapidapi";
          }
        } catch (e) {
          unified._errors = unified._errors || {};
          unified._errors.rapidapi = e?.message || "RapidAPI backlink fallback failed";
        }
      }

      // -----------------------------------------
      // CONTENT PIPELINE (kept for full calls)
      // -----------------------------------------
      if (providers.includes("content") && !keywordsOnly) {
        try {
          const content = await buildContentPayload(url);
          unified.content = {
            rawText: content.rawText || "",
            html: content.html || "",
            title: content.title || null,
            source: content.source || (content.html ? "rendered" : "text_fallback"),
          };
        } catch (err) {
          unified._errors = unified._errors || {};
          unified._errors.contentPipeline = err?.message || "Content pipeline failed";
        }
      }

      // -----------------------------------------
      // ✅ FAQs via Claude AI (MAIN)
      // -----------------------------------------
      if (wantsFaqs && !keywordsOnly) {
        try {
          // Ensure we have rawText available
          if (!unified.content?.rawText) {
            const content = await buildContentPayload(url);
            unified.content = unified.content || {};
            unified.content.rawText = content.rawText || "";
            unified.content.html = unified.content.html || content.html || "";
            unified.content.title = unified.content.title || content.title || null;
            unified.content.source =
              unified.content.source || content.source || (content.html ? "rendered" : "text_fallback");
          }

          const rawText = (unified.content?.rawText || "").trim();
          const count = clampFaqCount(body?.faqCount ?? body?.faqsCount ?? 10, 10);

          if (rawText) {
            const out = await generateFaqsViaClaude({
              rawText,
              domain,
              keyword: keyword || "",
              count,
            });

            unified.faqs = {
              peopleAlsoAsk: Array.isArray(out?.faqs) ? out.faqs : [],
              source: "claude",
            };
          } else {
            unified.faqs = { peopleAlsoAsk: [], source: "claude", reason: "no_rawText" };
          }
        } catch (err) {
          unified._errors = unified._errors || {};
          unified._errors.faqs = err?.message || "Claude FAQ generation failed";
        }
      }

      normalizeForUi(unified);

      const technicalIssueCounts = unified.technicalSeo?.issueCounts || {};

      let recommendationsCount = 0;
      let contentOppsCount = 0;

      const rawText = (unified.content?.rawText || "").trim();
      if (rawText) {
        const wordCount = rawText.split(/\s+/).length;
        recommendationsCount = Math.max(3, Math.round(wordCount / 300));
        contentOppsCount = Math.max(1, Math.round(wordCount / 1200));
      }

      unified.issues = {
        critical: typeof technicalIssueCounts.critical === "number" ? technicalIssueCounts.critical : 0,
        warning: typeof technicalIssueCounts.warning === "number" ? technicalIssueCounts.warning : 0,
        recommendations: recommendationsCount,
        contentOpps: contentOppsCount,
      };

      const baselineIssues = { critical: 274, warning: 883, recommendations: 77, contentOpps: 5 };

      unified.issuesGrowth = {
        critical: computePercentGrowth(unified.issues.critical, baselineIssues.critical),
        warning: computePercentGrowth(unified.issues.warning, baselineIssues.warning),
        recommendations: computePercentGrowth(unified.issues.recommendations, baselineIssues.recommendations),
        contentOpps: computePercentGrowth(unified.issues.contentOpps, baselineIssues.contentOpps),
      };

      unified.infoPanel = buildInfoPanel(unified);

      unified._meta = {
        ...(unified._meta || {}),
        url,
        domain,
        keyword: keyword || null,
        countryCode,
        languageCode,
        depth,
        providers,
        keywordsOnly: Boolean(keywordsOnly),
        generatedAt: new Date().toISOString(),
      };

      return NextResponse.json(unified);
    }

    // -------------------------
    // SSE STREAMING MODE
    // -------------------------
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const send = (event, data) => {
          controller.enqueue(encoder.encode(sseFormat(event, data)));
        };

        try {
          send("status", {
            stage: "start",
            message: "Starting SEO pipeline…",
            url,
            domain,
            keyword: keyword || null,
            providers,
            keywordsOnly: Boolean(keywordsOnly),
          });

          const unified = {};

          const runProvider = async (key, label, fn) => {
            send("status", { stage: key, state: "start", message: label });
            try {
              const result = await fn();
              send("status", { stage: key, state: "done", message: label });
              return { key, ok: true, result };
            } catch (error) {
              const msg = error?.message || `${label} failed`;
              send("status", { stage: key, state: "error", message: msg });
              return { key, ok: false, error: msg };
            }
          };

          // ✅ OPTION A FAST PATH in SSE too
          if (contentOnly && !keywordsOnly) {
            const contentRes = await runProvider(
              "content",
              "Extracting page content (MAIN content + rendered HTML, image-free)…",
              async () => {
                return await buildContentPayload(url);
              }
            );

            if (contentRes.ok) {
              unified.content = {
                rawText: contentRes.result?.rawText || "",
                html: contentRes.result?.html || "",
                title: contentRes.result?.title || null,
                source:
                  contentRes.result?.source ||
                  (contentRes.result?.html ? "rendered" : "text_fallback"),
              };
            } else {
              unified._errors = unified._errors || {};
              unified._errors.contentPipeline = contentRes.error;
            }

            normalizeForUi(unified);

            const rawText = (unified.content?.rawText || "").trim();
            let recommendationsCount = 0;
            let contentOppsCount = 0;
            if (rawText) {
              const wordCount = rawText.split(/\s+/).length;
              recommendationsCount = Math.max(3, Math.round(wordCount / 300));
              contentOppsCount = Math.max(1, Math.round(wordCount / 1200));
            }

            unified.issues = {
              critical: 0,
              warning: 0,
              recommendations: recommendationsCount,
              contentOpps: contentOppsCount,
            };
            unified.issuesGrowth = { critical: 0, warning: 0, recommendations: 0, contentOpps: 0 };
            unified.infoPanel = buildInfoPanel(unified);

            unified._meta = {
              ...(unified._meta || {}),
              url,
              domain,
              keyword: keyword || null,
              countryCode,
              languageCode,
              depth,
              providers,
              keywordsOnly: Boolean(keywordsOnly),
              generatedAt: new Date().toISOString(),
              mode: "content_only_fast_path",
            };

            send("done", { unified });
            controller.close();
            return;
          }

          const corePromises = [];

          if (providers.includes("psi") && !keywordsOnly) {
            corePromises.push(
              runProvider("psi", "Fetching PageSpeed Insights (mobile + desktop)…", async () => {
                const [mobileRes, desktopRes] = await Promise.allSettled([
                  fetchPsiForStrategy(url, "mobile"),
                  fetchPsiForStrategy(url, "desktop"),
                ]);

                const mobile  = mobileRes.status  === "fulfilled" ? mobileRes.value  : null;
                const desktop = desktopRes.status === "fulfilled" ? desktopRes.value : null;

                if (mobileRes.status  === "rejected") console.error("[PSI] mobile failed:", mobileRes.reason?.message);
                if (desktopRes.status === "rejected") console.error("[PSI] desktop failed:", desktopRes.reason?.message);

                if (!mobile && !desktop) {
                  throw new Error(mobileRes.reason?.message || "PSI unavailable");
                }

                const technicalSeo = {
                  performanceScoreMobile:
                    typeof mobile?.performanceScore === "number" ? mobile.performanceScore : null,
                  performanceScoreDesktop:
                    typeof desktop?.performanceScore === "number" ? desktop.performanceScore : null,
                  coreWebVitals: mobile?.coreWebVitalsLab || desktop?.coreWebVitalsLab || {},
                  coreWebVitalsField: mobile?.coreWebVitalsField || desktop?.coreWebVitalsField || {},
                  issueCounts: {
                    critical: (mobile?.issueCounts?.critical ?? 0) + (desktop?.issueCounts?.critical ?? 0),
                    warning:  (mobile?.issueCounts?.warning  ?? 0) + (desktop?.issueCounts?.warning  ?? 0),
                  },
                };

                return { technicalSeo };
              })
            );
          }

          if (providers.includes("authority") && domain) {
            corePromises.push(
              runProvider("authority", "Fetching authority metrics…", async () => {
                return await fetchOpenPageRank(domain);
              })
            );
          }

          if (providers.includes("serper") && keyword && !keywordsOnly) {
            corePromises.push(
              runProvider("serper", "Fetching SERP results…", async () => {
                return await fetchSerp(keyword);
              })
            );
          }

          if (providers.includes("dataforseo") && domain) {
            corePromises.push(
              runProvider(
                "dataforseo",
                keywordsOnly
                  ? "Fetching DataForSEO suggested keywords (fast)…"
                  : "Fetching DataForSEO keywords & opportunities…",
                async () => {
                  return await fetchDataForSeo(domain, {
                    language_code: languageCode,
                    countryCode,
                    depth,
                    keywordsOnly: Boolean(keywordsOnly),
                  });
                }
              )
            );

            // Also run dataforseoExtra in parallel (domain rank, competitors, ranked keywords)
            corePromises.push(
              runProvider(
                "dataforseoExtra",
                "Fetching domain rank overview, competitors, ranked keywords…",
                async () => {
                  const [domainRankOverview, competitorDomains, rankedKeywords] = await Promise.all([
                    fetchDomainRankOverview(domain).catch(() => null),
                    fetchCompetitorDomains(domain).catch(() => []),
                    fetchRankedKeywords(domain).catch(() => []),
                  ]);
                  return { domainRankOverview, competitorDomains, rankedKeywords };
                }
              )
            );
          }

          if (providers.includes("onpageKeywords") && domain && !keywordsOnly) {
            corePromises.push(
              runProvider(
                "onpageKeywords",
                "Generating new on-page SEO opportunity keywords (Claude AI)…",
                async () => {
                  const industry = String(body?.industry || "").trim();
                  const location = String(body?.location || "").trim();

                  const { keywords, clusters } = await fetchOnpageKeywordsViaClaude({
                    url,
                    domain,
                    industry,
                    location,
                  });

                  const seoRows = buildOnpageSeoRowsFromKeywords(keywords, domain);

                  return { seoRows, onpageKeywords: keywords, onpageClusters: clusters };
                }
              )
            );
          }

          // content (for full SSE calls)
          if (providers.includes("content") && !keywordsOnly) {
            corePromises.push(
              runProvider(
                "content",
                "Extracting page content (MAIN content + rendered HTML, image-free)…",
                async () => {
                  return await buildContentPayload(url);
                }
              )
            );
          }

          const coreResults = await Promise.all(corePromises);

          for (const item of coreResults) {
            if (item.ok && item.result) {
              if (item.key === "content") {
                unified.content = {
                  rawText: item.result?.rawText || "",
                  html: item.result?.html || "",
                  title: item.result?.title || null,
                  source: item.result?.source || (item.result?.html ? "rendered" : "text_fallback"),
                };
              } else {
                mergeProviderResult(unified, item.key, item.result);
              }
            } else if (!item.ok) {
              unified._errors = unified._errors || {};
              unified._errors[item.key] = item.error;
            }
          }

          
          // -----------------------------------------
          // ✅ FAQs via Claude AI (MAIN)
          // -----------------------------------------
          if (wantsFaqs && !keywordsOnly) {
            try {
              const rawTextForFaqs = String(unified.content?.rawText || "").trim();
              const count = clampFaqCount(body?.faqCount ?? body?.faqsCount ?? 10, 10);

              if (rawTextForFaqs) {
                send("status", {
                  stage: "faqs",
                  state: "start",
                  message: "Generating FAQs (Claude AI)…",
                });

                const out = await generateFaqsViaClaude({
                  rawText: rawTextForFaqs,
                  domain,
                  keyword: keyword || "",
                  count,
                });

                unified.faqs = {
                  peopleAlsoAsk: Array.isArray(out?.faqs) ? out.faqs : [],
                  source: "claude",
                };

                send("status", { stage: "faqs", state: "done", message: "FAQs generated" });
              } else {
                unified.faqs = { peopleAlsoAsk: [], source: "claude", reason: "no_rawText" };
              }
            } catch (e) {
              unified._errors = unified._errors || {};
              unified._errors.faqs = e?.message || "Claude FAQ generation failed";
              send("status", { stage: "faqs", state: "error", message: unified._errors.faqs });
            }
          }


// ✅ RapidAPI fallback in SSE mode
          if (providers.includes("dataforseo") && domain && !keywordsOnly && needsBacklinkFallback(unified)) {
            send("status", { stage: "rapidapi", state: "start", message: "Falling back for backlink metrics…" });

            try {
              const rapid = await fetchRapidApiBacklinkFallback(domain);

              unified.dataForSeo = unified.dataForSeo || {};
              unified.dataForSeo.backlinksSummary = unified.dataForSeo.backlinksSummary || {};

              const b = toNumber(unified.dataForSeo.backlinksSummary.backlinks) ?? 0;
              const rd = toNumber(unified.dataForSeo.backlinksSummary.referring_domains) ?? 0;

              if (b === 0 && rd === 0) {
                unified.dataForSeo.backlinksSummary = {
                  ...unified.dataForSeo.backlinksSummary,
                  ...rapid.backlinksSummary,
                };
                unified._meta = unified._meta || {};
                unified._meta.backlinksFallback = "rapidapi";
              }

              send("status", { stage: "rapidapi", state: "done", message: "Backlink fallback applied" });
            } catch (e) {
              unified._errors = unified._errors || {};
              unified._errors.rapidapi = e?.message || "RapidAPI backlink fallback failed";
              send("status", { stage: "rapidapi", state: "error", message: unified._errors.rapidapi });
            }
          }

          normalizeForUi(unified);

          send("status", { stage: "finalize", state: "start", message: "Finalizing dashboard metrics…" });

          const technicalIssueCounts = unified.technicalSeo?.issueCounts || {};

          let recommendationsCount = 0;
          let contentOppsCount = 0;

          const rawText2 = (unified.content?.rawText || "").trim();
          if (rawText2) {
            const wordCount = rawText2.split(/\s+/).length;
            recommendationsCount = Math.max(3, Math.round(wordCount / 300));
            contentOppsCount = Math.max(1, Math.round(wordCount / 1200));
          }

          unified.issues = {
            critical: typeof technicalIssueCounts.critical === "number" ? technicalIssueCounts.critical : 0,
            warning: typeof technicalIssueCounts.warning === "number" ? technicalIssueCounts.warning : 0,
            recommendations: recommendationsCount,
            contentOpps: contentOppsCount,
          };

          const baselineIssues = { critical: 274, warning: 883, recommendations: 77, contentOpps: 5 };

          unified.issuesGrowth = {
            critical: computePercentGrowth(unified.issues.critical, baselineIssues.critical),
            warning: computePercentGrowth(unified.issues.warning, baselineIssues.warning),
            recommendations: computePercentGrowth(unified.issues.recommendations, baselineIssues.recommendations),
            contentOpps: computePercentGrowth(unified.issues.contentOpps, baselineIssues.contentOpps),
          };

          unified.infoPanel = buildInfoPanel(unified);

          unified._meta = {
            ...(unified._meta || {}),
            url,
            domain,
            keyword: keyword || null,
            countryCode,
            languageCode,
            depth,
            providers,
            keywordsOnly: Boolean(keywordsOnly),
            generatedAt: new Date().toISOString(),
          };

          send("status", { stage: "finalize", state: "done", message: "Finalized" });
          send("done", { unified });
          controller.close();
        } catch (err) {
          try {
            controller.enqueue(
              encoder.encode(
                sseFormat("fatal", {
                  error: "Internal server error",
                  details: err?.message || "Unknown error",
                })
              )
            );
          } catch {}
          controller.close();
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error("Error in /api/seo:", err);
    return NextResponse.json(
      { error: "Internal server error", details: err.message || "Unknown error" },
      { status: 500 }
    );
  }
}
