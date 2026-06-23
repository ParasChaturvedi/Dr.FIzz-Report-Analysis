// src/app/api/report/generate-analysis/route.js
import { NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { getCached, putCached } from "@/lib/cache/mongo";
import { scoreCompleteness, summarizeUsage } from "@/lib/cache/usage";
import { reportCacheType } from "@/lib/cache/report-key";

import { claudeChatStream } from "@/lib/claude/client";
import {
  fetchDomainRankOverview,
  fetchCompetitorDomains,
  fetchRankedKeywords,
  fetchDataForSeo,
} from "@/lib/seo/dataforseo";
import { fetchPsiForStrategy } from "@/lib/seo/psi";
import { fetchMozMetrics } from "@/lib/seo/moz/client";
import { runBusinessLogic, deriveCompetitorBrands } from "@/lib/seo/doctor-fizz-logic";
import { runQaGate } from "@/lib/seo/doctor-fizz-qa";
import { getSiteProfile } from "@/lib/claude/pipeline";
import { fmtNum, fmtInt } from "@/lib/seo/report-format";
import { checkExistingPage } from "@/lib/seo/report-evidence";

export const runtime     = "nodejs";
export const maxDuration = 300; // PSI alone can take 90-120 s; Claude adds another 30-60 s

// ─── helpers ───────────────────────────────────────────────────────────────────

function ensureHttpUrl(input) {
  const raw = String(input || "").trim();
  if (!raw) return null;
  return raw.includes("://") ? raw : `https://${raw}`;
}

function getDomain(url) {
  try {
    const u = new URL(ensureHttpUrl(url));
    return u.hostname.replace(/^www\./, "");
  } catch {
    return String(url || "")
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split("/")[0];
  }
}

function isPageUrl(url) {
  try {
    const u = new URL(ensureHttpUrl(url));
    return u.pathname && u.pathname !== "/" && u.pathname !== "";
  } catch {
    return false;
  }
}

async function safeCall(fn) {
  try {
    return await fn();
  } catch {
    return null;
  }
}

function fmt(n, fallback = "—") {
  if (n == null) return fallback;
  // 0 is a valid DataForSEO result — show "0" rather than "—"
  if (n === 0) return "0";
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return String(n);
}

// ─── Claude helper: generate structured JSON sections ─────────────────────────

async function generateWithAI(systemPrompt, userPrompt, fallback = {}, meta = {}) {
  try {
    const { content } = await claudeChatStream({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      model: "claude-opus-4-8", // Opus 4.8 = deepest, most-accurate analysis (user: max accuracy). Cached per site, so paid once per 30 days.
      max_tokens: 16000,  // large strategy JSON + adaptive-thinking tokens; 7000 truncated mid-JSON and silently blanked sections
      timeoutMs: 280000,
      meta,
    });

    let parsed = null;
    try {
      parsed = JSON.parse(content);
    } catch {
      const m = content.match(/\{[\s\S]*\}/);
      try { parsed = m ? JSON.parse(m[0]) : null; } catch { parsed = null; }
    }
    if (!parsed) {
      // Almost always a truncated/over-long response — make it VISIBLE in logs instead
      // of silently returning empty strategy sections on a paid report.
      console.error(`[generate-analysis] AI JSON parse FAILED (likely truncation) — len=${(content || "").length}, tail=${JSON.stringify(String(content || "").slice(-160))}`);
    }
    return parsed || fallback;
  } catch (e) {
    console.error("[generate-analysis] AI error:", e?.message);
    return fallback;
  }
}

// ─── Real-data builders (no AI needed — derived from collected metrics) ────────

function buildTechnicalPrioritiesFromCrawl(crawlData) {
  if (!crawlData) return [];
  const s = crawlData.summary || {};
  const issues = [];

  if (crawlData.crawlBlockedByRobots)
    issues.push({ priority: "CRITICAL", issue: "Googlebot blocked by robots.txt", action: "Remove 'Disallow: /' from robots.txt immediately — Google cannot index any page until this is fixed." });

  if (!crawlData.hasSitemap)
    issues.push({ priority: "HIGH", issue: "XML sitemap is missing", action: "Create /sitemap.xml listing all important URLs and submit it in Google Search Console → Sitemaps." });

  if (!(s.pagesWithSchemaTypes || []).length)
    issues.push({ priority: "HIGH", issue: "Zero structured data (schema) on any page", action: "Add LocalBusiness + WebSite JSON-LD to homepage, Service schema to service pages, FAQ schema to FAQ sections. Critical for AI Overview (GEO) inclusion." });

  if ((s.pagesMissingMetaTitle || 0) > 0)
    issues.push({ priority: "HIGH", issue: `${s.pagesMissingMetaTitle} pages missing <title> tags`, action: `Write unique 50–60 character titles formatted "Primary Keyword | Brand". Start with highest-traffic pages.` });

  if ((s.pagesMissingH1 || 0) > 0)
    issues.push({ priority: "HIGH", issue: `${s.pagesMissingH1} of ${crawlData.pageCount} pages have no H1 heading`, action: "Add exactly one keyword-rich H1 per page. This is the clearest on-page relevance signal for Google." });

  if ((s.pagesMissingMetaDesc || 0) > 0)
    issues.push({ priority: "MEDIUM", issue: `${s.pagesMissingMetaDesc} pages missing meta descriptions`, action: "Write 150–160 character descriptions with a CTA. Good meta descriptions improve click-through rate by 5–10%." });

  const dupTitles = (crawlData.duplicates || []).filter(d => d.type === "title").length;
  if (dupTitles > 0)
    issues.push({ priority: "MEDIUM", issue: `${dupTitles} sets of duplicate meta title tags`, action: "Duplicate titles force Google to choose which URL to rank arbitrarily — make every title unique." });

  if ((crawlData.brokenLinks || []).length > 0)
    issues.push({ priority: "MEDIUM", issue: `${crawlData.brokenLinks.length} broken internal links found`, action: `Fix or 301-redirect each broken URL. First: ${crawlData.brokenLinks.slice(0, 2).map(b => b.url).join(", ")}` });

  if ((s.thinContentCount || 0) > 0)
    issues.push({ priority: "MEDIUM", issue: `${s.thinContentCount} pages with thin content (<200 words)`, action: "Expand to 600+ words with FAQs and local context. Thin pages drag down the entire site's quality signal." });

  if ((s.totalImgsWithoutAlt || 0) > 5)
    issues.push({ priority: "MEDIUM", issue: `${s.totalImgsWithoutAlt} images missing alt text`, action: "Add descriptive alt text to every image using keywords naturally. Affects accessibility score and image search visibility." });

  if ((s.pagesMultipleH1 || 0) > 0)
    issues.push({ priority: "LOW", issue: `${s.pagesMultipleH1} pages have multiple H1 tags`, action: "Each page should have exactly one H1. Demote extra H1s to H2 or H3." });

  if (!crawlData.hasRobots)
    issues.push({ priority: "LOW", issue: "robots.txt file not found", action: "Create /robots.txt and include: Sitemap: https://yourdomain.com/sitemap.xml" });

  return issues.slice(0, 8);
}

function buildLocalSearchFromGmb(gmbData) {
  if (!gmbData) return null;
  const gmb = gmbData.gmb || {};
  const checklist = [];

  if (!gmb.found) {
    checklist.push("Create Google Business Profile at business.google.com — the single highest-ROI local SEO action");
    checklist.push("Verify within 5 days via phone or postcard — unverified listings are invisible");
    checklist.push("Fill NAP (Name, Address, Phone) to exactly match your website footer");
    checklist.push("Choose the most specific primary category + 2 secondary categories");
    checklist.push("Upload 10+ photos: exterior, interior, team, products, before/after");
    checklist.push("Write 750-character business description — put primary keywords in first 250 chars");
    checklist.push("Set accurate hours including special/holiday hours");
    checklist.push("Submit NAP to JustDial, Sulekha, IndiaMART, Trustpilot for citation consistency");
  } else {
    if (!gmb.isVerified)     checklist.push("URGENT: Verify your GMB listing — unverified profiles rank far below verified ones");
    if (!gmb.phone)          checklist.push("Add local phone number — missing contact info reduces conversions by ~30%");
    if (!gmb.address)        checklist.push("Add full street address — required for Local Pack (map pack) ranking");
    if (!gmb.hoursAvailable) checklist.push("Set business hours including holiday hours — affects when you appear in 'open now' searches");
    if (!gmb.hasPhotos)      checklist.push("Upload 10+ photos — GMB listings with photos get 42% more direction requests");
    const reviews = gmb.reviewCount || 0;
    if (reviews < 25)        checklist.push(`Get to 25 reviews: WhatsApp each recent customer with a direct review link (need ${25 - reviews} more)`);
    if ((gmbData.unrepliedReviewCount || 0) > 0) checklist.push(`Reply to all ${gmbData.unrepliedReviewCount} unanswered reviews within 24h — Google tracks owner response rate`);
    if ((gmbData.listedDirectoryCount || 0) < 3)  checklist.push("Build 5+ directory citations (JustDial, Sulekha, IndiaMART, Trustpilot, Facebook) for NAP consistency");
    checklist.push("Post 1–2 Google Business updates per week (offers, news, new services, team highlights)");
    const unansweredQA = (gmbData.qa || []).filter(q => !q.hasAnswer).length;
    if (unansweredQA > 0)    checklist.push(`Answer ${unansweredQA} unanswered Q&As — each answered question adds free long-tail content`);
  }

  const reviews = gmb.reviewCount || 0;
  const rating = gmb.rating;
  const reviewTarget = rating
    ? `Target: ${Math.max(50, reviews + 25)} reviews at ${rating >= 4.5 ? "4.5★+" : "4.8★"} within 6 months (currently ${reviews} at ${rating}★). Use WhatsApp automation after each job. Template: "Hi [Name], thanks for choosing us! Your honest Google review takes 30 seconds: [link]"`
    : "First milestone: 25 reviews at 4.8★ within 90 days. Send a post-service WhatsApp with a short Google review link.";

  return { gbpChecklist: checklist.slice(0, 8), reviewTarget };
}

// Relevance vocabulary — the strongest signals of what the business ACTUALLY is:
// the user-selected keywords, declared services, and the real homepage title. Used to
// drop off-topic gap keywords (e.g. "live location", "good colleges in pune for mba")
// that a competitor happens to rank for but have nothing to do with the client.
function buildNicheVocab({ businessData, userKeywords, crawlRaw }) {
  const STOP = new Set("the a an of for in on to and or with your you our we is are this that best top near me services service company companies agency agencies india usa uk 2023 2024 2025 2026 how what why which can do does cost price guide list".split(/\s+/));
  const homepageTitle = crawlRaw?.pages?.[0]?.metaTitle || crawlRaw?.pages?.[0]?.title || crawlRaw?.homepage?.title || "";
  const src = [
    ...(Array.isArray(userKeywords) ? userKeywords : []),
    businessData?.category, businessData?.specificService, businessData?.offeringType,
    businessData?.offering, businessData?.industry, businessData?.industrySector,
    ...(Array.isArray(businessData?.coreServices) ? businessData.coreServices : []),
    homepageTitle,
  ].filter(Boolean).join(" ").toLowerCase();
  const vocab = new Set();
  for (const w of src.replace(/[^a-z0-9 ]+/g, " ").split(/\s+/)) {
    if (w.length >= 3 && !STOP.has(w)) vocab.add(w);
  }
  return vocab;
}
function _kwRelevant(keyword, vocab, exclusions) {
  const kw = String(keyword || "").toLowerCase();
  if (!kw) return false;
  for (const ex of (exclusions || [])) { const e = String(ex || "").toLowerCase().trim(); if (e && kw.includes(e)) return false; }
  if (!vocab || !vocab.size) return true;                       // no signal → don't over-filter
  const words = kw.replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
  return words.some((w) => vocab.has(w));                       // share ≥1 meaningful token
}

// Tier 1 = PRIMARY COMMERCIAL keywords only (real Service/Landing-Page intent). Every
// tier is relevance-filtered, competitor-brand-filtered (#4 — no "social beat" etc.),
// demand-gated, and de-duped across tiers (so Tier 2 never just repeats Tier 1).
function buildKeywordTiersFromGap(keywordGapData, vocab, exclusions, brands = []) {
  if (!keywordGapData) return null;
  const fmtVol = (v) => v >= 1000 ? `${(v / 1000).toFixed(1).replace(/\.0$/, "")}K/mo` : v > 0 ? `${v}/mo` : "<100/mo";
  const brandList = (brands || []).map(b => String(b || "").toLowerCase().trim()).filter(b => b.length >= 3);
  const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const GENERIC = new Set("social media web digital marketing seo online india agency agencies services service company companies tech technologies technology solutions solution group studio studios labs lab design designs creative consulting consultancy global world best top hub pro new".split(/\s+/));
  // a keyword that contains a competitor brand is dropped — the FULL brand as a word, or
  // a single-word brand's distinctive token; never a generic word like "social"/"media".
  const isBrand = (kw) => {
    const k = ` ${String(kw || "").toLowerCase()} `;
    return brandList.some(b => {
      if (new RegExp(`\\b${esc(b)}\\b`).test(k)) return true;
      const toks = b.split(/[\s.\-/]+/).filter(Boolean);
      return toks.length === 1 && toks[0].length >= 5 && !GENERIC.has(toks[0]) && new RegExp(`\\b${esc(toks[0])}\\b`).test(k);
    });
  };
  const isCommercial = (intent) => ["transactional", "commercial", "local", "navigational"].includes(String(intent || "").toLowerCase());
  const seen = new Set();
  const fresh = (s) => { const n = String(s || "").toLowerCase().trim(); if (!n || seen.has(n)) return false; seen.add(n); return true; };
  // relevant + non-brand + (demand>0 for page tiers).
  const okPage = (k) => _kwRelevant(k?.keyword, vocab, exclusions) && !isBrand(k?.keyword) && Number(k?.volume ?? 0) > 0;

  const tier1 = (keywordGapData.easyWins || [])
    .filter(k => isCommercial(k.intent) && okPage(k))
    .filter(k => fresh(k.keyword))
    .slice(0, 8)
    .map(k => ({ keyword: k.keyword, volume: fmtVol(k.volume), targetPageType: "Service/Landing Page", kd: k.kd ?? null }));

  const localKws = (keywordGapData.gapKeywords || [])
    .filter(k => (k.intent === "local" || k.intent === "transactional") && okPage(k))
    .filter(k => fresh(k.keyword))
    .slice(0, 6)
    .map(k => k.keyword);

  // Tier 3 = informational blog questions (relevant, non-brand). PAA carries no volume,
  // so it is not demand-gated — these are topic ideas, not pages to build.
  const infoKws = (keywordGapData.paaQuestions || [])
    .map(q => q?.question ?? q)
    .filter(q => _kwRelevant(q, vocab, exclusions) && !isBrand(q))
    .filter(q => fresh(q))
    .slice(0, 6);

  if (!tier1.length && !localKws.length && !infoKws.length) return null;
  return { tier1, tier2Neighborhood: localKws, tier3Informational: infoKws };
}

function buildMeasuringSuccessRows(baselineMetrics, crawlData, gmbData) {
  const toNum = (v) => {
    if (!v || v === "—") return null;
    const s = String(v).replace(/[,\s]/g, "");
    const m = s.match(/^([0-9.]+)([KkMm]?)$/);
    if (!m) return null;
    const n = parseFloat(m[1]);
    const mult = m[2]?.toLowerCase() === "k" ? 1000 : m[2]?.toLowerCase() === "m" ? 1000000 : 1;
    return Math.round(n * mult);
  };
  const fmtN = (n) => n >= 1000000 ? `${(n/1000000).toFixed(1)}M` : n >= 1000 ? `${(n/1000).toFixed(0)}K` : String(n);

  const bm = baselineMetrics || {};
  const drN = toNum(bm.domainRating);
  const tN  = toNum(bm.organicTraffic);
  const kN  = toNum(bm.organicKeywords);
  const rN  = toNum(bm.referringDomains);

  // #17 — the CURRENT column is formatted (no raw "1248.774014055729"): compact for
  // traffic, thousands-separated integers for counts. Site Health 6-month target is
  // clamped to never read below the current score (a target must be an improvement).
  const healthNow = crawlData?.healthScore;
  const health6 = healthNow != null ? Math.max(Number(healthNow), 75) : 75;
  const health12 = healthNow != null ? Math.max(Number(healthNow) + 3, 90) : 90;
  return [
    { metric: "Domain Rating",     now: drN != null ? fmtInt(drN) : (bm.domainRating || "—"), s6: drN != null ? String(Math.min(100, drN + 5))      : "Growing", s12: drN != null ? String(Math.min(100, drN + 15)) : "20+" },
    { metric: "Organic Keywords",  now: kN  != null ? fmtInt(kN)  : "—",                      s6: kN  != null ? fmtN(Math.round(kN * 1.6))          : "+60%",    s12: kN  != null ? fmtN(kN * 3)                   : "+200%" },
    { metric: "Organic Traffic",   now: tN  != null ? `${fmtNum(tN)}/mo` : "—",               s6: tN  != null ? `${fmtN(Math.round(tN * 1.8))}/mo`  : "+80%",    s12: tN  != null ? `${fmtN(tN * 4)}/mo`           : "+300%" },
    { metric: "Referring Domains", now: rN  != null ? fmtInt(rN)  : "—",                      s6: rN  != null ? String(rN + 15)                     : "+15",     s12: rN  != null ? String(rN + 40)                : "+40" },
    { metric: "Site Health Score", now: healthNow != null ? `${healthNow}/100` : "—",         s6: `${health6}/100`,  s12: `${health12}/100` },
    { metric: "GMB Completeness",  now: gmbData?.completeness?.score != null ? `${gmbData.completeness.score}/100` : "—", s6: "80/100", s12: "95/100" },
  ];
}

// ─── Website-level AI analysis ────────────────────────────────────────────────

async function generateWebsiteAnalysis({ domain, keywords, competitors, businessData, seoData, crawlData, gmbData, keywordGapData, negativeExclusions }) {
  const primaryKw = (keywords || []).slice(0, 5).join(", ") || domain;
  const competitorList = (competitors || []).slice(0, 5).join(", ") || "major industry players";
  const industry = businessData?.industrySector || businessData?.industry || "business";
  // Terms the user explicitly wants excluded — never let Claude surface them in any section.
  const exclusions = (Array.isArray(negativeExclusions) ? negativeExclusions : [])
    .map((t) => String(t || "").trim())
    .filter(Boolean);
  const exclusionRule = exclusions.length
    ? `\n- NEVER recommend, mention, or target these excluded terms (the user has explicitly excluded them from this business): ${exclusions.join(", ")}. Do not surface them in any keyword, competitor, content blueprint, uncontested page, or recommendation.`
    : "";

  const systemPrompt = `You are DoctorFizz Intelligence, an elite SEO & GEO strategy engine.
You produce ruthlessly specific, data-backed strategy for real businesses. Every item must reference the client's actual data — industry, keywords, competitors, domain metrics.
Rules:
- ANALYZE FIRST: before writing anything, deeply read ALL the metrics provided below (domain rating, organic traffic & keywords, mobile/desktop PSI, site-health/crawl, schema coverage, GMB rating/reviews/completeness, and the real keyword-gap data). Identify THIS site's specific weaknesses and opportunities, then make every recommendation address a concrete finding and cite the actual number/fact from the data. Never give a recommendation the data does not justify, and never output generic boilerplate.
- AUDIENCE & STYLE: write for a NON-TECHNICAL small-business owner with ZERO SEO knowledge. Use plain, everyday English. The FIRST time you use any SEO term (schema, canonical, backlink, crawl, indexing, SoV, E-E-A-T, etc.), add a 2–4 word plain explanation in parentheses. Be CONCISE and SHORT — punchy, scannable, no filler, no repetition; the reader must NOT get bored. Make each recommendation a tiny guide: WHAT to do, WHY it matters (tie it to their actual number), and HOW (one concrete step). Encouraging and clear, never intimidating or jargon-heavy.
- Return STRICT JSON matching the exact schema below.
- Keyword volumes: use realistic industry estimates (format: "2K–5K/mo", "800/mo"). Never use "—" for volumes.
- Content blueprint vol/pos: realistic estimates like "1.2K/mo", "Top 5".
- Do NOT mention Claude, Anthropic, or any AI tool by name.
- Describe the client and its competitors by their ACTUAL category from the data. NEVER invent size/type descriptors like "boutique", "small", "startup", or "niche" unless the data explicitly supports them.
- The provided "Industry" hint can be WRONG (it is a manual dropdown). Determine the client's REAL industry from the homepage title/content provided and use THAT throughout — never describe the business as something the website clearly is not.
- contentArchitecture.siteStructure must list ONLY NEW pages the site should BUILD to capture keyword gaps / uncovered services — do NOT list pages that already exist (Homepage, About, Contact, existing service pages). Each entry maps to a real keyword opportunity.
- competitorLandscape.localCompetitors AND nationalPlatforms must BOTH be REAL businesses that DIRECTLY compete with the client (same offering, comparable tier) — draw them from the "Competitors listed" above. localCompetitors = local/regional rivals; nationalPlatforms = the same kind of direct competitor operating at national scale. NEVER list search aggregators, directories, marketplaces, review sites, or listing platforms (e.g. Justdial, Sulekha, Clutch, GoodFirms, Techreviewer, Yelp) — those are search intermediaries, NOT business competitors, and must never appear here.
- Every keyword, competitor, and recommendation MUST be genuinely relevant to what THIS business actually offers. If a data point looks irrelevant to the business, DROP it — do not include it just to fill the list.
- Do NOT give generic advice. Every sentence must be specific to THIS business.${exclusionRule}`;

  const domainCtx = seoData ? `
DOMAIN AUTHORITY & TRAFFIC (live data):
  Domain Rating:      ${seoData.dr || "—"}
  Referring Domains:  ${seoData.referringDomains || "—"}
  Organic Keywords:   ${seoData.organicKeywords || "—"}
  Monthly Traffic:    ${seoData.organicTraffic || "—"}
  Mobile PSI:         ${seoData.performanceMobile || "—"}
  Desktop PSI:        ${seoData.performanceDesktop || "—"}
  Core Web Vitals — LCP: ${seoData.lcp != null ? `${seoData.lcp} ms` : "—"} | CLS: ${seoData.cls != null ? seoData.cls : "—"}` : "";

  const crawlCtx = crawlData ? `

SITE HEALTH (crawl audit):
  Health Score: ${crawlData.healthScore ?? "N/A"}/100  |  Pages: ${crawlData.pageCount || 0}  |  Avg word count: ${crawlData.summary?.avgWordCount ?? 0}
  Schema types found: ${(crawlData.summary?.pagesWithSchemaTypes || []).join(", ") || "NONE"}
  Sitemap: ${crawlData.hasSitemap ? "Present" : "MISSING"}  |  Crawl blocked: ${crawlData.crawlBlockedByRobots ? "YES" : "No"}` : "";

  const gmbCtx = gmbData ? `

GMB STATUS:
  Found: ${gmbData.gmb?.found ? "Yes" : "NO"}  |  Rating: ${gmbData.gmb?.rating ? `${gmbData.gmb.rating}★ (${gmbData.gmb.reviewCount} reviews)` : "N/A"}
  Completeness: ${gmbData.completeness?.score ?? 0}/100  |  Directories listed: ${gmbData.listedDirectoryCount ?? 0}/10` : "";

  const kwCtx = keywordGapData ? `

KEYWORD GAP (real competitor data):
  Gap keywords: ${keywordGapData.summary?.totalGapKeywords ?? 0} found
  Easy wins: ${(keywordGapData.easyWins || []).slice(0, 6).map(k => `"${k.keyword}" (vol:${k.volume})`).join(", ")}
  Top gaps: ${(keywordGapData.gapKeywords || []).slice(0, 6).map(k => `"${k.keyword}" (vol:${k.volume})`).join(", ")}
  People Also Ask: ${(keywordGapData.paaQuestions || []).slice(0, 4).map(q => q.question).join(" | ")}` : "";

  const userPrompt = `Generate a deep, data-specific SEO & GEO strategy for this business. Every recommendation must reference the real numbers below.

BUSINESS PROFILE:
  Domain:    ${domain}
  Industry hint (MAY BE WRONG — verify from the homepage title): ${industry}
  Homepage title (the REAL business — use this to determine the true industry): ${crawlData?.pages?.[0]?.metaTitle || crawlData?.pages?.[0]?.title || "(not captured)"}
  Offering:  ${businessData?.offeringType || "services"}
  Keywords:  ${primaryKw}
  Competitors listed: ${competitorList}
  Location:  ${businessData?.location || "India"}
${domainCtx}${crawlCtx}${gmbCtx}${kwCtx}

NOTE: Technical SEO issues and GMB checklist are computed separately from real crawl data. You handle only the strategic and creative sections below.

Return ONLY this JSON (no markdown, no commentary):
{
  "competitorLandscape": {
    "localCompetitors": [
      {"name": "...", "domain": "...", "description": "what makes them strong vs ${domain}", "strength": "High/Medium/Low"},
      {"name": "...", "domain": "...", "description": "...", "strength": "..."},
      {"name": "...", "domain": "...", "description": "...", "strength": "..."}
    ],
    "nationalPlatforms": [
      {"name": "real national-scale competitor (NOT an aggregator/directory)", "domain": "...", "description": "why this national competitor is a threat to ${domain}", "threat": "High/Medium"},
      {"name": "...", "domain": "...", "description": "...", "threat": "..."}
    ],
    "localOpening": "2–3 sentences on the specific local opportunity for ${domain} given the competitor landscape"
  },
  "contentArchitecture": {
    "siteStructure": [
      {"page": "New page to build (must NOT already exist)", "url": "/new-page-slug", "purpose": "the keyword gap / uncovered service this NEW page captures"},
      {"page": "...", "url": "/slug", "purpose": "..."},
      {"page": "...", "url": "/slug", "purpose": "..."},
      {"page": "...", "url": "/slug", "purpose": "..."},
      {"page": "...", "url": "/slug", "purpose": "..."},
      {"page": "...", "url": "/slug", "purpose": "..."}
    ],
    "checklist": [
      "specific checklist item for ${domain}",
      "specific checklist item",
      "specific checklist item",
      "specific checklist item",
      "specific checklist item"
    ]
  },
  "competitiveIntelligence": {
    "whatWorksForThem": [
      "specific tactic competitor uses — reference real keyword or content type",
      "...", "...", "..."
    ],
    "gapsYouCanExploit": [
      "specific gap ${domain} can fill — reference keyword or page type",
      "...", "...", "..."
    ]
  },
  "linkBuilding": {
    "citationBuilding": ["specific directory or citation source for this industry", "...", "...", "..."],
    "contentDrivenLinks": ["specific linkable asset idea with target audience", "...", "...", "..."],
    "competitorLinkGap": ["specific site or domain type competitor has links from that ${domain} doesn't", "...", "...", "..."]
  },
  "roadmap": [
    {"phase": 1, "title": "Quick Wins", "duration": "Week 1–2", "actions": ["specific action 1", "specific action 2", "specific action 3"]},
    {"phase": 2, "title": "On-Page & Content", "duration": "Week 3–4", "actions": ["...", "...", "..."]},
    {"phase": 3, "title": "Authority & GEO", "duration": "Month 2", "actions": ["...", "...", "..."]},
    {"phase": 4, "title": "Scale & Compound", "duration": "Month 3–6", "actions": ["...", "...", "..."]}
  ],
  "contentBlueprint": [
    {"blogPost": "specific title using a real PAA question or gap keyword", "topKeyword": "exact keyword", "vol": "est volume", "pos": "expected position"},
    {"blogPost": "...", "topKeyword": "...", "vol": "...", "pos": "..."},
    {"blogPost": "...", "topKeyword": "...", "vol": "...", "pos": "..."},
    {"blogPost": "...", "topKeyword": "...", "vol": "...", "pos": "..."},
    {"blogPost": "...", "topKeyword": "...", "vol": "...", "pos": "..."}
  ],
  "uncontested": [
    {"page": "specific page name for ${domain}", "keyword": "exact target keyword", "volume": "est monthly volume"},
    {"page": "...", "keyword": "...", "volume": "..."},
    {"page": "...", "keyword": "...", "volume": "..."},
    {"page": "...", "keyword": "...", "volume": "..."}
  ],
  "geoFrontier": {
    "domainAICitations": "realistic current estimate for ${domain}",
    "competitorAICitations": "realistic estimate for top competitor",
    "howToEarnCitations": [
      "specific step for ${industry} business to earn AI citations",
      "...", "...", "...", "..."
    ]
  },
  "quickWins180": [
    {"week": "Week 1–2", "actions": ["specific action 1 with metric or outcome", "...", "..."]},
    {"week": "Week 3–4", "actions": ["...", "...", "..."]},
    {"week": "Month 2",  "actions": ["...", "...", "..."]},
    {"week": "Month 3–6","actions": ["...", "...", "..."]}
  ],
  "strategicPriorities": [
    {"priority": "01", "title": "Specific Priority for ${domain}", "description": "2 sentences on why this is the #1 lever based on the data"},
    {"priority": "02", "title": "...", "description": "..."},
    {"priority": "03", "title": "...", "description": "..."}
  ]
}`;

  return generateWithAI(systemPrompt, userPrompt, {
    competitorLandscape: { localCompetitors: [], nationalPlatforms: [], localOpening: "" },
    contentArchitecture: { siteStructure: [], checklist: [] },
    competitiveIntelligence: { whatWorksForThem: [], gapsYouCanExploit: [] },
    linkBuilding: { citationBuilding: [], contentDrivenLinks: [], competitorLinkGap: [] },
    roadmap: [],
    contentBlueprint: [],
    uncontested: [],
    geoFrontier: { domainAICitations: "—", competitorAICitations: "—", howToEarnCitations: [] },
    quickWins180: [],
    strategicPriorities: [],
  }, { domain, api: "claude", label: "website-analysis" });
}

// ─── Page-level AI analysis ───────────────────────────────────────────────────

async function generatePageAnalysis({ url, domain, keyword, businessData, psiData, pageData }) {
  const targetKeyword = keyword || domain;
  const industry = businessData?.industrySector || businessData?.industry || "business";
  const lcp = psiData?.coreWebVitals?.LCP || psiData?.coreWebVitals?.lcp;
  const cls = psiData?.coreWebVitals?.CLS || psiData?.coreWebVitals?.cls;
  const perfScore = psiData?.performanceScoreMobile || psiData?.performanceScore;

  // REAL crawled values for THIS page (so Claude never fabricates the current state).
  // crawl page shape: { metaTitle, metaDesc, h1s[], content: { wordCount } }
  const curTitle    = pageData?.metaTitle || "—";
  const curMetaDesc = pageData?.metaDesc || "—";
  const curH1       = (Array.isArray(pageData?.h1s) ? pageData.h1s.filter(Boolean) : []).join(" | ") || "—";
  const curWordCount = pageData?.content?.wordCount != null ? String(pageData.content.wordCount) : "—";

  const systemPrompt = `You are DoctorFizz Intelligence, an expert on-page SEO analyst.
You analyze individual web pages and produce specific, actionable optimization recommendations.
Always return STRICT JSON. Never mention Claude, Anthropic, or DataForSEO.
Use "DoctorFizz Intelligence" as the analysis source label.
CRITICAL: The CURRENT page values (title, meta description, H1, word count) are PROVIDED below from a live crawl. Use the PROVIDED current values EXACTLY as given — NEVER invent, guess, or fabricate them. Only generate the recommended/optimized versions yourself. If a current value is given as "—" it was genuinely empty/missing on the page, so treat it as missing (do not make one up).`;

  const userPrompt = `Analyze this page and produce a complete on-page SEO optimization report.

URL: ${url}
Domain: ${domain}
Target Keyword: ${targetKeyword}
Industry: ${industry}
LCP: ${lcp || "—"} | CLS: ${cls || "—"} | Performance Score: ${perfScore || "—"}

CURRENT PAGE CONTENT (live crawl — use these EXACT values for every "current" field; do NOT invent):
  Current Title:       ${curTitle}
  Current Meta Desc:   ${curMetaDesc}
  Current H1:          ${curH1}
  Current Word Count:  ${curWordCount}
Use the values above verbatim wherever the schema asks for a "current" title/meta/H1/word-count (e.g. metadata.titleTag.current, metadata.metaDescription.current, heroExecution.h1.current). Generate ONLY the "recommended"/optimized versions yourself.

Return JSON with exactly these keys:
{
  "executiveSummary": {
    "diagnosis": {
      "titleTagScore": "score like 3/10",
      "keywordDensity": "percentage like 0.8%",
      "metaDescription": "score like 2/10",
      "h1Present": true
    },
    "prescription": ["action1", "action2", "action3", "action4"],
    "headline": "one powerful sentence summarizing the opportunity"
  },
  "priorityActionPlan": [
    {"rank": 1, "label": "CRITICAL", "action": "...", "timeEstimate": "2 hours"},
    {"rank": 2, "label": "HIGH", "action": "...", "timeEstimate": "1 hour"},
    {"rank": 3, "label": "HIGH", "action": "...", "timeEstimate": "30 min"},
    {"rank": 4, "label": "MEDIUM", "action": "...", "timeEstimate": "1 hour"},
    {"rank": 5, "label": "QUICK", "action": "...", "timeEstimate": "15 min"}
  ],
  "keywordStrategy": {
    "primary": [
      {"keyword": "...", "monthlySearches": "...", "difficulty": "..."},
      {"keyword": "...", "monthlySearches": "...", "difficulty": "..."},
      {"keyword": "...", "monthlySearches": "...", "difficulty": "..."}
    ],
    "bestOpportunity": "one sentence about best keyword opportunity",
    "secondary": [
      {"keyword": "...", "monthlySearches": "...", "difficulty": "..."},
      {"keyword": "...", "monthlySearches": "...", "difficulty": "..."},
      {"keyword": "...", "monthlySearches": "...", "difficulty": "..."}
    ]
  },
  "metadata": {
    "titleTag": {
      "problem": "...",
      "current": "...",
      "recommended": "..."
    },
    "metaDescription": {
      "problem": "...",
      "current": "...",
      "recommended": "..."
    }
  },
  "heroExecution": {
    "h1": {"current": "...", "recommended": "..."},
    "subheading": {"current": "...", "recommended": "..."},
    "body": {"current": "...", "recommended": "..."}
  },
  "contentPositioning": {
    "currentHeading": "...",
    "recommendedHeading": "...",
    "bodyRewrites": [{"area": "...", "current": "...", "recommended": "..."}]
  },
  "workflowLayer": [
    {"area": "...", "currentLabel": "...", "recommendedLabel": "..."},
    {"area": "...", "currentLabel": "...", "recommendedLabel": "..."},
    {"area": "...", "currentLabel": "...", "recommendedLabel": "..."}
  ],
  "aiVisibility": {
    "dashboardFeatures": ["feature1", "feature2", "feature3"],
    "useCases": [
      {"useCase": "...", "targetUser": "...", "keyword": "..."},
      {"useCase": "...", "targetUser": "...", "keyword": "..."}
    ]
  },
  "geoLayer": {
    "faqAnalysis": "one paragraph about FAQ opportunity for this page",
    "faqs": [
      {"question": "...", "answer": "..."},
      {"question": "...", "answer": "..."},
      {"question": "...", "answer": "..."}
    ],
    "faqJsonLd": "{\\"@context\\": \\"https://schema.org\\", \\"@type\\": \\"FAQPage\\", \\"mainEntity\\": []}",
    "principles": [
      {"title": "...", "description": "..."},
      {"title": "...", "description": "..."},
      {"title": "...", "description": "..."},
      {"title": "...", "description": "..."}
    ]
  },
  "implementation": {
    "sprint1": {"title": "Technical Fixes", "duration": "Week 1", "tasks": ["...", "...", "..."]},
    "sprint2": {"title": "Content Optimization", "duration": "Week 2", "tasks": ["...", "...", "..."]},
    "sprint3": {"title": "GEO & Authority", "duration": "Week 3–4", "tasks": ["...", "...", "..."]},
    "measurementChecklist": ["metric1", "metric2", "metric3", "metric4"]
  }
}`;

  return generateWithAI(systemPrompt, userPrompt, {
    executiveSummary: { diagnosis: {}, prescription: [], headline: "" },
    priorityActionPlan: [],
    keywordStrategy: { primary: [], bestOpportunity: "", secondary: [] },
    metadata: { titleTag: {}, metaDescription: {} },
    heroExecution: { h1: {}, subheading: {}, body: {} },
    contentPositioning: { currentHeading: "", recommendedHeading: "", bodyRewrites: [] },
    workflowLayer: [],
    aiVisibility: { dashboardFeatures: [], useCases: [] },
    geoLayer: { faqAnalysis: "", faqs: [], faqJsonLd: "", principles: [] },
    implementation: { sprint1: {}, sprint2: {}, sprint3: {}, measurementChecklist: [] },
  }, { domain, api: "claude", label: "page-analysis" });
}

// ─── Main POST handler ─────────────────────────────────────────────────────────

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const {
      url, keyword,
      countryCode = "in", languageCode = "en",
      businessData, keywordData, competitorData,
      reportMode, negativeExclusions,          // V3 Part 3.1 / 3.4 setup-flow inputs
      seoData: prefetchedSeoData, // pre-fetched from Step 5 SSE (avoids double API call)
    } = body || {};

    if (!url) {
      return NextResponse.json({ error: "Missing url" }, { status: 400 });
    }

    const safeUrl = ensureHttpUrl(url);
    const domain = getDomain(safeUrl);
    const reportType = isPageUrl(safeUrl) ? "page" : "website";

    // ── 30-day REPORT cache, keyed by domain + the inputs that change the report ──
    // On a fresh hit we return the SAVED report (no fetches, no Claude). The id is
    // regenerated so each view has its own id; the data comes from the cache.
    const reportDataType = reportCacheType({ reportType, businessData, competitorData, reportMode, keyword, countryCode, negativeExclusions });
    const _cachedReport = await getCached({ domain, dataType: reportDataType, ttlDays: 30 });
    if (_cachedReport) {
      console.log(`[cache HIT] report:${domain} — returning saved report (no fetch, no Claude)`);
      return NextResponse.json({ id: randomUUID(), reportType, data: _cachedReport });
    }

    // ── Authoritative industry from the LIVE site ────────────────────────────────
    // The onboarding industry is a manual dropdown that's frequently wrong (e.g.
    // "Technology & Software" for a digital-marketing agency). A wrong industry poisons
    // the GEO prompts and the whole narrative, so detect the REAL one from the site and
    // override it for everything downstream (report framing + GEO prompts).
    if (reportType === "website" && businessData && typeof businessData === "object") {
      try {
        const { profile } = await getSiteProfile({ input: domain, industry: businessData?.industry || "", location: businessData?.location || "" });
        if (profile?.industry) {
          if (businessData.industry && profile.industry.toLowerCase() !== String(businessData.industry).toLowerCase())
            console.log(`[generate-analysis] industry corrected: "${businessData.industry}" → "${profile.industry}"`);
          businessData.industry = profile.industry;
          businessData.industrySector = profile.industry;
          if (profile.primaryOffering && !businessData.offering) businessData.offering = profile.primaryOffering;
        }
      } catch (e) { console.warn("[generate-analysis] industry detect failed:", e?.message); }
    }

    const keywords = Array.isArray(keywordData)
      ? keywordData.map((k) => (typeof k === "string" ? k : k?.label)).filter(Boolean)
      : [];

    // V3 Part 4 — keep business and search competitors SEPARATE so the logic layer
    // can validate them: only business competitors enter direct comparison.
    const businessCompetitors = Array.isArray(competitorData?.businessCompetitors) ? competitorData.businessCompetitors : [];
    const searchCompetitorsList = Array.isArray(competitorData?.searchCompetitors) ? competitorData.searchCompetitors : [];
    // Merged list retained only for the free-text Claude narrative helper (not comparison).
    const competitors = [...businessCompetitors, ...searchCompetitorsList];

    // ── Resolve PSI from prefetched data (if valid values present) ───────────
    const normScore = (v) => (v != null ? Math.round(Number(v) <= 1 ? Number(v) * 100 : Number(v)) : null);

    let mobileScore = null;
    let desktopScore = null;
    let cwvLab = {};
    let issueCritical = 0;
    let issueWarning = 0;

    const prefetchPsi = prefetchedSeoData?.technicalSeo;
    if (prefetchPsi) {
      mobileScore  = normScore(prefetchPsi.performanceScoreMobile  ?? prefetchPsi.mobile?.score);
      desktopScore = normScore(prefetchPsi.performanceScoreDesktop ?? prefetchPsi.desktop?.score);
      cwvLab = prefetchPsi.coreWebVitals ?? prefetchPsi.coreWebVitalsLab ?? {};
    }

    // ── Resolve DataForSEO metrics — prefer prefetched, always fresh-fetch if missing ──
    let dr = null;
    let referringDomains = null;
    let organicKeywords = null;
    let organicTraffic = null;

    const prefetchDr = prefetchedSeoData?.domainRankOverview;
    if (prefetchDr) {
      // Accept 0 as a valid DataForSEO result (small/new sites legitimately have 0 traffic)
      dr               = prefetchDr.rank           != null ? prefetchDr.rank           : null;
      organicTraffic   = prefetchDr.organicTraffic  != null ? prefetchDr.organicTraffic  : null;
      organicKeywords  = prefetchDr.organicKeywords  != null ? prefetchDr.organicKeywords  : null;
      referringDomains = prefetchDr.referringDomains ?? null;
    }

    // Always fresh-fetch if values are still missing (handles 0 returns, parse failures, etc.)
    const needFreshDfs = organicTraffic == null || organicKeywords == null;
    const needFreshPsi = mobileScore == null && desktopScore == null;

    const [domainRankData, psiMobileRaw, psiDesktopRaw] = await Promise.all([
      needFreshDfs ? safeCall(() => fetchDomainRankOverview(domain)) : Promise.resolve(null),
      needFreshPsi ? safeCall(() => fetchPsiForStrategy(safeUrl, "mobile")) : Promise.resolve(null),
      needFreshPsi ? safeCall(() => fetchPsiForStrategy(safeUrl, "desktop")) : Promise.resolve(null),
    ]);

    if (needFreshPsi && (psiMobileRaw || psiDesktopRaw)) {
      // Use whichever succeeded — mobile preferred for CWV (most relevant)
      mobileScore  = normScore(psiMobileRaw?.performanceScore)  ?? null;
      desktopScore = normScore(psiDesktopRaw?.performanceScore) ?? null;
      cwvLab       = psiMobileRaw?.coreWebVitalsLab ?? psiDesktopRaw?.coreWebVitalsLab ?? {};
      issueCritical = (psiMobileRaw?.issueCounts?.critical ?? 0) + (psiDesktopRaw?.issueCounts?.critical ?? 0);
      issueWarning  = (psiMobileRaw?.issueCounts?.warning  ?? 0) + (psiDesktopRaw?.issueCounts?.warning  ?? 0);
    }

    if (needFreshDfs && domainRankData) {
      if (organicTraffic  == null) organicTraffic  = domainRankData.organicTraffic  ?? null;
      if (organicKeywords == null) organicKeywords = domainRankData.organicKeywords ?? null;
      if (dr              == null) dr              = domainRankData.rank             ?? null;
    }

    // Domain Rating + referring domains + total backlinks come from Moz — the DataForSEO
    // domain overview does NOT carry them, which is why the report was showing them as
    // "unavailable". Same accurate source the Info panel uses (e.g. itzfizz DA 52).
    let backlinks = null;
    const moz = await safeCall(() => fetchMozMetrics(domain, { withList: false }));
    if (moz) {
      if (Number.isFinite(moz.domainAuthority)) dr = moz.domainAuthority;       // 0-100 DA
      const rd = moz.backlinksSummary?.referring_domains;
      if (Number.isFinite(rd) && rd > 0) referringDomains = rd;
      const bl = moz.backlinksSummary?.backlinks;
      if (Number.isFinite(bl) && bl > 0) backlinks = bl;
    }

    console.log("[generate-analysis] baseline:", { dr, organicTraffic, organicKeywords, referringDomains, backlinks, mobileScore, desktopScore });

    const psiData = {
      performanceScoreMobile: mobileScore,
      performanceScoreDesktop: desktopScore,
      coreWebVitals: cwvLab,
      issueCounts: { critical: issueCritical, warning: issueWarning },
    };

    // ── Build baseline metrics ────────────────────────────────────────────────
    // Metrics: store formatted strings for text fields, null for missing numbers
    // PSI scores stored as integer (0-100), NOT as strings with "/100" — the report component adds that
    // Store RAW numbers (NOT formatted strings). The logic + report format them via
    // formatMetricValue. Passing "1.3K"-style strings here caused Number("1.3K") → NaN
    // in the storytelling ("draws NaN organic traffic"). Raw numbers also keep full
    // precision (1,289 instead of a lossy 1.3K).
    const baselineMetrics = {
      domainRating:     Number.isFinite(dr)               ? dr               : null,
      referringDomains: Number.isFinite(referringDomains) ? referringDomains : null,
      organicKeywords:  Number.isFinite(organicKeywords)  ? organicKeywords  : null,
      organicTraffic:   Number.isFinite(organicTraffic)   ? organicTraffic   : null,
      backlinks:        Number.isFinite(backlinks)        ? backlinks        : null, // Moz total backlinks
      errors404:        null, // requires backlink subscription
      redirectChains:   null, // requires backlink subscription
      performanceMobile:  mobileScore,   // integer 0-100 or null
      performanceDesktop: desktopScore,  // integer 0-100 or null
      lcp: (cwvLab?.lcp ?? cwvLab?.LCP) != null ? Math.round(cwvLab?.lcp ?? cwvLab?.LCP) : null, // ms, whole number
      cls: (cwvLab?.cls ?? cwvLab?.CLS) != null ? Math.round((cwvLab?.cls ?? cwvLab?.CLS) * 100) / 100 : null, // 2 decimals
    };

    // ── Compute real-data sections (no AI needed — derived from collected metrics) ──
    const crawlRaw   = prefetchedSeoData?.websiteCrawl ?? null;
    const gmbRaw     = prefetchedSeoData?.gmbCheck     ?? null;
    const kwGapRaw   = prefetchedSeoData?.keywordGap   ?? null;

    // Real broken-page count from the crawl (status >= 400 / unreachable) → the "404
    // Errors" baseline metric. Only set when the crawl actually ran (else stays null).
    const _brokenLinks = Array.isArray(crawlRaw?.brokenLinks) ? crawlRaw.brokenLinks : null;
    if (_brokenLinks) {
      baselineMetrics.errors404 = _brokenLinks.filter((l) => {
        const s = Number(l?.status);
        return s >= 400 || /unreachable|timeout|error/i.test(String(l?.status || ""));
      }).length;
    }

    const realTechnical     = buildTechnicalPrioritiesFromCrawl(crawlRaw);
    const realLocalSearch   = buildLocalSearchFromGmb(gmbRaw);
    const _nicheVocab       = buildNicheVocab({ businessData, userKeywords: keywords, crawlRaw });
    // Competitor brand names (business + search rivals + user-listed) → keep them out of
    // the keyword tiers so no rival's brand ("social beat", "webchutney"…) is ever shown
    // as a keyword target. (#4)
    const _competitorBrands = deriveCompetitorBrands([
      ...(Array.isArray(businessCompetitors) ? businessCompetitors : []),
      ...(Array.isArray(searchCompetitorsList) ? searchCompetitorsList : []),
      ...(Array.isArray(competitors) ? competitors : []),
    ]);
    const realKwTiers       = buildKeywordTiersFromGap(kwGapRaw, _nicheVocab, negativeExclusions, _competitorBrands);
    const measuringSuccessRows = buildMeasuringSuccessRows(baselineMetrics, crawlRaw, gmbRaw);

    // ── STAGE 3: Doctor Fizz business logic layer ─────────────────────────────
    // Classifies keywords, separates content, categorizes backlinks, builds GBP
    // comparison, validates KPIs, and labels missing data — per the spec Parts 1-2.
    // This produces the canonical structured payload that drives the report.
    const rawKeywordsForLogic = [
      ...(kwGapRaw?.gapKeywords || []),
      ...(kwGapRaw?.newOpportunities || []),
      ...(kwGapRaw?.easyWins || []),
      ...(kwGapRaw?.targetRanked || []),
      ...(kwGapRaw?.paaQuestions || []).map(q => ({ keyword: q.question, volume: 0, difficulty: 0.2 })),
    ];

    const competitorGmbs = Array.isArray(prefetchedSeoData?.competitorAudit?.competitors)
      ? prefetchedSeoData.competitorAudit.competitors
          .filter(c => c?.gmb && !c.gmb.error)
          .map(c => ({ domain: c.domain, name: c.name || c.domain, gmbCheck: c.gmb }))
      : [];

    const competitorBacklinks = Array.isArray(kwGapRaw?.competitorBacklinks)
      ? kwGapRaw.competitorBacklinks
      : [];

    // Live GEO/AI-visibility scan (cached 30 days by /api/seo/geo-scan). When present,
    // Section 10 shows REAL Share-of-Voice + citation intelligence (overall + per engine)
    // instead of the "pending" placeholders. null = scan hasn't run → placeholders.
    const geoViz = await getCached({ domain, dataType: "geo-visibility", ttlDays: 30 }).catch(() => null);

    let structuredPayload = null;
    let qaResult = null;
    try {
      structuredPayload = runBusinessLogic({
        aiVisibility: geoViz,
        domain,
        clientName: businessData?.businessName || businessData?.name || domain,
        industry:   businessData?.industrySector || businessData?.industry || businessData?.category || "",
        reportType,
        location:   businessData?.location || (countryCode === "in" ? "India" : "India"),
        baselineRaw: {
          ...baselineMetrics,
          crawlHealthScore:     crawlRaw?.healthScore ?? null,
          gbpCompletenessScore: gmbRaw?.completeness?.score ?? null,
          gbpReviewCount:       gmbRaw?.gmb?.reviewCount ?? gmbRaw?.reviewCount ?? null,
          gbpRating:            gmbRaw?.gmb?.rating ?? null,
          // Site-audit counts — surfaced only when the crawl/audit actually provides them.
          errors404:            baselineMetrics.errors404,
          redirectChains:       crawlRaw?.redirectChains ?? crawlRaw?.summary?.redirectChains ?? null,
        },
        competitors,
        businessCompetitors,           // V3 Part 4 — validated for direct comparison
        searchCompetitors: searchCompetitorsList, // V3 Part 4 — SERP/search context only
        // V3 Part 3 setup-flow inputs (each with a downstream purpose)
        reportMode:    reportMode || businessData?.reportMode || "",
        businessScope: businessData?.businessScope || businessData?.scope || "",
        coreServices:  businessData?.coreServices || businessData?.services || [],
        negativeExclusions: Array.isArray(negativeExclusions) ? negativeExclusions : (businessData?.negativeExclusions || []),
        rawKeywords: rawKeywordsForLogic,
        // #3 — real SERP intelligence per priority keyword (top-10 + features + AI Overview).
        serpIntel:   kwGapRaw?.serpIntel || {},
        crawlData:   crawlRaw,
        clientGmb:   gmbRaw,
        competitorGmbs,
        competitorAudits: Array.isArray(prefetchedSeoData?.competitorAudit?.competitors)
          ? prefetchedSeoData.competitorAudit.competitors
          : [],
        directories: gmbRaw?.directories || [],
        competitorBacklinks,
        // Ground-truth Google data when the client has connected GSC/GA4.
        verifiedData: (prefetchedSeoData?.gsc || prefetchedSeoData?.ga4)
          ? { gsc: prefetchedSeoData?.gsc || null, ga4: prefetchedSeoData?.ga4 || null }
          : null,
        clientServiceTerms: [
          businessData?.category, businessData?.specificService,
          businessData?.offeringType, businessData?.offering,
        ].filter(Boolean),
        targetKeywords: keywords,
      });
      qaResult = runQaGate(structuredPayload);
      console.log(`[generate-analysis] business logic: ${structuredPayload.keywords.accepted.length} accepted, ${structuredPayload.keywords.excluded.length} excluded, ${structuredPayload.keywords.brand_monitoring_only.length} brand-monitoring | QA ${qaResult.passedCount}/${qaResult.total} (${qaResult.score}%)`);
    } catch (logicErr) {
      console.error("[generate-analysis] business logic failed:", logicErr?.message);
    }

    // ── Generate AI sections (strategic/creative only) ────────────────────────
    let aiSections = {};

    if (reportType === "website") {
      aiSections = await generateWebsiteAnalysis({
        domain,
        keywords,
        // Competitor landscape (local + national) is built from BUSINESS competitors
        // ONLY — real direct rivals, never SERP aggregators/directories. Falls back
        // to the merged list only if no business competitors were found at all.
        competitors: (Array.isArray(businessCompetitors) && businessCompetitors.length)
          ? businessCompetitors
          : competitors,
        businessData,
        seoData: {
          dr:               dr             != null ? String(dr)           : "—",
          referringDomains: referringDomains != null ? fmt(referringDomains) : "—",
          organicKeywords:  organicKeywords  != null ? fmt(organicKeywords)  : "—",
          organicTraffic:   organicTraffic   != null ? fmt(organicTraffic)   : "—",
          performanceMobile:  mobileScore  != null ? `${mobileScore}/100`  : "—",
          performanceDesktop: desktopScore != null ? `${desktopScore}/100` : "—",
          // Core Web Vitals (already rounded + null-safe in baselineMetrics) so Claude can cite them
          lcp: baselineMetrics.lcp,
          cls: baselineMetrics.cls,
        },
        crawlData:      crawlRaw,
        gmbData:        gmbRaw,
        keywordGapData: kwGapRaw,
        // Pass excluded terms so Claude never surfaces them in contentBlueprint/uncontested/etc.
        negativeExclusions: Array.isArray(negativeExclusions) ? negativeExclusions : (businessData?.negativeExclusions || []),
      });

      // Override AI placeholders with real computed sections
      if (realTechnical.length > 0)  aiSections.technicalPriorities = realTechnical;
      if (realLocalSearch)           aiSections.localSearch          = realLocalSearch;
      if (realKwTiers) {
        // Merge: prefer real tier1 (easy wins with real volumes), keep AI tier2/3 as fallback
        aiSections.keywordStrategy = {
          tier1:             realKwTiers.tier1.length     ? realKwTiers.tier1             : (aiSections.keywordStrategy?.tier1 || []),
          tier2Neighborhood: realKwTiers.tier2Neighborhood.length ? realKwTiers.tier2Neighborhood : (aiSections.keywordStrategy?.tier2Neighborhood || []),
          tier3Informational: realKwTiers.tier3Informational.length ? realKwTiers.tier3Informational : (aiSections.keywordStrategy?.tier3Informational || []),
        };
      }

      // ── #2 / #5 — "What Pages To Build" from the REAL classified architecture, with an
      // existing-page guard (never recommend a page that already exists) and a pages-vs-
      // blogs split. Service/commercial + geography → pages to build; informational → blogs.
      const _ca = structuredPayload?.content_architecture || null;
      const _crawlPages = Array.isArray(crawlRaw?.pages) ? crawlRaw.pages : [];
      if (_ca) {
        const trim1 = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();
        const fmtVol = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? (n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K/mo` : `${n}/mo`) : ""; };
        const toBuild = (p, kind) => ({
          page:    trim1(p.page_name || p.proposed_title || p.keyword_cluster || ""),
          url:     p.url_slug || "",
          purpose: trim1(p.commercial_reason || p.why_separate_page || p.search_intent || p.funnel_connection || ""),
          volume:  fmtVol(p.primary_volume),
          intent:  p.intent_class || (kind === "blog" ? "informational" : "commercial"),
        });
        const newOnly = (arr) => (Array.isArray(arr) ? arr : []).filter((p) => !checkExistingPage(p, _crawlPages).exists);
        const pagesToBuild = [
          ...newOnly(_ca.commercial_pages).map((p) => toBuild(p, "page")),
          ...newOnly(_ca.geography_pages || _ca.city_pages).map((p) => toBuild(p, "geo")),
        ].slice(0, 8);
        const blogsToBuild = newOnly(_ca.blog_and_guides).map((p) => toBuild(p, "blog")).slice(0, 8);
        aiSections.contentArchitecture = {
          ...(aiSections.contentArchitecture || {}),
          pagesToBuild,
          blogsToBuild,
          pagesExistingFlagged: structuredPayload?.evidence_plan?.counts?.pages_existing_flagged ?? 0,
          // keep the AI "Every Page Must Include" checklist (the on-page requirements card)
          checklist: aiSections.contentArchitecture?.checklist || [],
        };
      }

      // §7 — replace the generic competitor link-gap with REAL referring domains that link
      // to competitors but not to you (DataForSEO Backlinks API), when collected.
      const _blGap = Array.isArray(kwGapRaw?.backlinkGap) ? kwGapRaw.backlinkGap : [];
      if (_blGap.length) {
        aiSections.linkBuilding = aiSections.linkBuilding || {};
        aiSections.linkBuilding.competitorLinkGap = _blGap.slice(0, 8).map((g) =>
          `${g.referring_domain}${g.rank != null ? ` (rank ${g.rank})` : ""} links to ${(g.links_to || []).join(", ") || "a competitor"} — pitch them the same value (data, quote, resource) to earn the link.`);
      }
    } else {
      // Find the REAL crawled content for THIS page so Claude uses the actual
      // current title/meta/H1/word-count instead of inventing them. Match on the
      // normalized full URL first, then fall back to pathname (handles www / trailing
      // slash / protocol differences between safeUrl and the crawled url).
      const _normUrl = (u) => String(u || "").replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "").toLowerCase();
      const _normPath = (u) => { try { return new URL(ensureHttpUrl(u)).pathname.replace(/\/+$/, "") || "/"; } catch { return null; } };
      const _crawlPages = Array.isArray(crawlRaw?.pages) ? crawlRaw.pages : [];
      const _targetNorm = _normUrl(safeUrl);
      const _targetPath = _normPath(safeUrl);
      const pageData =
        _crawlPages.find((p) => _normUrl(p?.url) === _targetNorm) ||
        (_targetPath ? _crawlPages.find((p) => _normPath(p?.url) === _targetPath) : null) ||
        null;

      aiSections = await generatePageAnalysis({
        url: safeUrl,
        domain,
        keyword: keywords[0] || keyword || domain,
        businessData,
        psiData,
        pageData,
      });
    }

    // ── Assemble final report data ────────────────────────────────────────────
    const reportData = {
      domain,
      url: safeUrl,
      reportType,
      generatedAt: new Date().toISOString(),
      baselineMetrics: {
        ...baselineMetrics,
        // Add crawl health and GMB scores to baseline for display
        crawlHealthScore: crawlRaw?.healthScore ?? null,
        gmbCompletenessScore: gmbRaw?.completeness?.score ?? null,
      },
      psiData,
      keywords,
      competitors,
      businessData: businessData || {},
      ...aiSections,
      measuringSuccessRows,
      // ── Doctor Fizz Stage-3 structured payload + QA result ──
      // Canonical classified/validated data per spec Part 2. The Dashboard and
      // strategic-plan consume this for the diagnostic, separated sections.
      doctorFizz:      structuredPayload,
      qaResult,
      // Include enriched SEO data so Dashboard can read it from report cache
      websiteCrawl:    crawlRaw,
      gmbCheck:        gmbRaw,
      competitorAudit: prefetchedSeoData?.competitorAudit ?? null,
      keywordGap:      kwGapRaw,
      strategicPlan:   prefetchedSeoData?.strategicPlan   ?? null,
    };

    // ── Per-report cost + data-confidence metrics (from the usage log + the data) ──
    try {
      const completeness = scoreCompleteness(reportData);
      const usage = await summarizeUsage({ domain, sinceMs: 25 * 60 * 1000 });
      const usd = Math.round(usage.totalUSD * 100) / 100;
      reportData.metrics = {
        cost: {
          usd, inr: Math.round(usd * 84),
          claudeUSD: Math.round(usage.claudeUSD * 100) / 100,
          apiUSD: Math.round(usage.apiUSD * 1000) / 1000,
          byApi: usage.byApi, calls: usage.calls, cacheHits: usage.cacheHits,
          claudeTokens: usage.claudeTokens,
        },
        completeness, // { score, present[], missing[], confidence }
        generatedAt: new Date().toISOString(),
      };
    } catch (mErr) { console.warn("[metrics] non-fatal:", mErr?.message); }

    // Append the report to the 30-day cache (no-op without Mongo). Repeat reports
    // for the same site + inputs will return this instantly — no fetches, no Claude.
    try { await putCached({ domain, dataType: reportDataType, payload: reportData, source: "report", forClientDomain: domain }); } catch {}

    // ── Persist to /tmp/reports/{id}.json ────────────────────────────────────
    const id = randomUUID();
    const reportsDir = join("/tmp", "reports");

    try {
      await mkdir(reportsDir, { recursive: true });
      await writeFile(join(reportsDir, `${id}.json`), JSON.stringify({ id, reportType, data: reportData }), "utf8");
    } catch (writeErr) {
      console.error("[generate-analysis] Failed to write report file:", writeErr?.message);
      // Still return the data even if file write fails
    }

    return NextResponse.json({ id, reportType, data: reportData });
  } catch (err) {
    console.error("[generate-analysis] Error:", err);
    return NextResponse.json({ error: "Failed to generate report", details: err?.message }, { status: 500 });
  }
}
