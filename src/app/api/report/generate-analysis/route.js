// src/app/api/report/generate-analysis/route.js
import { NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";

import { claudeChatStream } from "@/lib/claude/client";
import {
  fetchDomainRankOverview,
  fetchCompetitorDomains,
  fetchRankedKeywords,
  fetchDataForSeo,
} from "@/lib/seo/dataforseo";
import { fetchPsiForStrategy } from "@/lib/seo/psi";
import { runBusinessLogic } from "@/lib/seo/doctor-fizz-logic";
import { runQaGate } from "@/lib/seo/doctor-fizz-qa";

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

async function generateWithAI(systemPrompt, userPrompt, fallback = {}) {
  try {
    const { content } = await claudeChatStream({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 7000,
      timeoutMs: 90000,
    });

    let parsed = null;
    try {
      parsed = JSON.parse(content);
    } catch {
      const m = content.match(/\{[\s\S]*\}/);
      try { parsed = m ? JSON.parse(m[0]) : null; } catch { parsed = null; }
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

function buildKeywordTiersFromGap(keywordGapData) {
  if (!keywordGapData) return null;
  const fmtVol = (v) => v >= 1000 ? `${(v / 1000).toFixed(0)}K/mo` : v > 0 ? `${v}/mo` : "<100/mo";

  const tier1 = (keywordGapData.easyWins || []).slice(0, 5).map(k => ({
    keyword:        k.keyword,
    volume:         fmtVol(k.volume),
    targetPageType: k.intent === "transactional" ? "Service/Landing Page" : k.intent === "commercial" ? "Comparison Page" : "Blog/Guide",
  }));

  const localKws = (keywordGapData.gapKeywords || [])
    .filter(k => k.intent === "local" || k.intent === "transactional")
    .slice(0, 5)
    .map(k => k.keyword);

  const infoKws = (keywordGapData.paaQuestions || []).slice(0, 5).map(q => q.question);

  if (!tier1.length && !localKws.length) return null;
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

  return [
    { metric: "Domain Rating",     now: bm.domainRating    || "—", s6: drN != null ? String(Math.min(100, drN + 5))      : "Growing", s12: drN != null ? String(Math.min(100, drN + 15)) : "20+" },
    { metric: "Organic Keywords",  now: bm.organicKeywords || "—", s6: kN  != null ? fmtN(Math.round(kN * 1.6))          : "+60%",    s12: kN  != null ? fmtN(kN * 3)                   : "+200%" },
    { metric: "Organic Traffic",   now: bm.organicTraffic  || "—", s6: tN  != null ? `${fmtN(Math.round(tN * 1.8))}/mo`  : "+80%",    s12: tN  != null ? `${fmtN(tN * 4)}/mo`           : "+300%" },
    { metric: "Referring Domains", now: bm.referringDomains|| "—", s6: rN  != null ? String(rN + 15)                     : "+15",     s12: rN  != null ? String(rN + 40)                : "+40" },
    { metric: "Site Health Score", now: crawlData?.healthScore  != null ? `${crawlData.healthScore}/100`        : "—", s6: "75/100",  s12: "90/100" },
    { metric: "GMB Completeness",  now: gmbData?.completeness?.score != null ? `${gmbData.completeness.score}/100` : "—", s6: "80/100", s12: "95/100" },
  ];
}

// ─── Website-level AI analysis ────────────────────────────────────────────────

async function generateWebsiteAnalysis({ domain, keywords, competitors, businessData, seoData, crawlData, gmbData, keywordGapData }) {
  const primaryKw = (keywords || []).slice(0, 5).join(", ") || domain;
  const competitorList = (competitors || []).slice(0, 5).join(", ") || "major industry players";
  const industry = businessData?.industrySector || businessData?.industry || "business";

  const systemPrompt = `You are ItzFizz Intelligence, an elite SEO & GEO strategy engine.
You produce ruthlessly specific, data-backed strategy for real businesses. Every item must reference the client's actual data — industry, keywords, competitors, domain metrics.
Rules:
- Return STRICT JSON matching the exact schema below.
- Keyword volumes: use realistic industry estimates (format: "2K–5K/mo", "800/mo"). Never use "—" for volumes.
- Content blueprint vol/pos: realistic estimates like "1.2K/mo", "Top 5".
- Do NOT mention Claude, Anthropic, or any AI tool by name.
- Do NOT give generic advice. Every sentence must be specific to THIS business.`;

  const domainCtx = seoData ? `
DOMAIN AUTHORITY & TRAFFIC (live data):
  Domain Rating:      ${seoData.dr || "—"}
  Referring Domains:  ${seoData.referringDomains || "—"}
  Organic Keywords:   ${seoData.organicKeywords || "—"}
  Monthly Traffic:    ${seoData.organicTraffic || "—"}
  Mobile PSI:         ${seoData.performanceMobile || "—"}
  Desktop PSI:        ${seoData.performanceDesktop || "—"}` : "";

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
  Industry:  ${industry}
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
      {"name": "...", "description": "why they intercept ${industry} searches", "threat": "High/Medium"},
      {"name": "...", "description": "...", "threat": "..."}
    ],
    "localOpening": "2–3 sentences on the specific local opportunity for ${domain} given the competitor landscape"
  },
  "contentArchitecture": {
    "siteStructure": [
      {"page": "Homepage", "url": "/", "purpose": "..."},
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
  });
}

// ─── Page-level AI analysis ───────────────────────────────────────────────────

async function generatePageAnalysis({ url, domain, keyword, businessData, psiData }) {
  const targetKeyword = keyword || domain;
  const industry = businessData?.industrySector || businessData?.industry || "business";
  const lcp = psiData?.coreWebVitals?.LCP || psiData?.coreWebVitals?.lcp;
  const cls = psiData?.coreWebVitals?.CLS || psiData?.coreWebVitals?.cls;
  const perfScore = psiData?.performanceScoreMobile || psiData?.performanceScore;

  const systemPrompt = `You are ItzFizz Intelligence, an expert on-page SEO analyst.
You analyze individual web pages and produce specific, actionable optimization recommendations.
Always return STRICT JSON. Never mention Claude, Anthropic, or DataForSEO.
Use "ItzFizz Intelligence" as the analysis source label.`;

  const userPrompt = `Analyze this page and produce a complete on-page SEO optimization report.

URL: ${url}
Domain: ${domain}
Target Keyword: ${targetKeyword}
Industry: ${industry}
LCP: ${lcp || "—"} | CLS: ${cls || "—"} | Performance Score: ${perfScore || "—"}

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
  });
}

// ─── Main POST handler ─────────────────────────────────────────────────────────

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const {
      url, keyword,
      countryCode = "in", languageCode = "en",
      businessData, keywordData, competitorData,
      seoData: prefetchedSeoData, // pre-fetched from Step 5 SSE (avoids double API call)
    } = body || {};

    if (!url) {
      return NextResponse.json({ error: "Missing url" }, { status: 400 });
    }

    const safeUrl = ensureHttpUrl(url);
    const domain = getDomain(safeUrl);
    const reportType = isPageUrl(safeUrl) ? "page" : "website";

    const keywords = Array.isArray(keywordData)
      ? keywordData.map((k) => (typeof k === "string" ? k : k?.label)).filter(Boolean)
      : [];

    const competitors = [
      ...(Array.isArray(competitorData?.businessCompetitors) ? competitorData.businessCompetitors : []),
      ...(Array.isArray(competitorData?.searchCompetitors) ? competitorData.searchCompetitors : []),
    ];

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

    console.log("[generate-analysis] baseline:", { dr, organicTraffic, organicKeywords, mobileScore, desktopScore });

    const psiData = {
      performanceScoreMobile: mobileScore,
      performanceScoreDesktop: desktopScore,
      coreWebVitals: cwvLab,
      issueCounts: { critical: issueCritical, warning: issueWarning },
    };

    // ── Build baseline metrics ────────────────────────────────────────────────
    // Metrics: store formatted strings for text fields, null for missing numbers
    // PSI scores stored as integer (0-100), NOT as strings with "/100" — the report component adds that
    const baselineMetrics = {
      domainRating:     dr             != null ? String(dr)               : null,
      referringDomains: referringDomains != null ? fmt(referringDomains)  : null,
      organicKeywords:  organicKeywords  != null ? fmt(organicKeywords)   : null,
      organicTraffic:   organicTraffic   != null ? fmt(organicTraffic)    : null,
      errors404:        null, // requires backlink subscription
      redirectChains:   null, // requires backlink subscription
      performanceMobile:  mobileScore,   // integer 0-100 or null
      performanceDesktop: desktopScore,  // integer 0-100 or null
      lcp: cwvLab?.lcp ?? cwvLab?.LCP ?? null, // ms (number) or null
      cls: cwvLab?.cls ?? cwvLab?.CLS ?? null, // decimal or null
    };

    // ── Compute real-data sections (no AI needed — derived from collected metrics) ──
    const crawlRaw   = prefetchedSeoData?.websiteCrawl ?? null;
    const gmbRaw     = prefetchedSeoData?.gmbCheck     ?? null;
    const kwGapRaw   = prefetchedSeoData?.keywordGap   ?? null;

    const realTechnical     = buildTechnicalPrioritiesFromCrawl(crawlRaw);
    const realLocalSearch   = buildLocalSearchFromGmb(gmbRaw);
    const realKwTiers       = buildKeywordTiersFromGap(kwGapRaw);
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
          .map(c => ({ domain: c.domain, gmbCheck: c.gmb }))
      : [];

    const competitorBacklinks = Array.isArray(kwGapRaw?.competitorBacklinks)
      ? kwGapRaw.competitorBacklinks
      : [];

    let structuredPayload = null;
    let qaResult = null;
    try {
      structuredPayload = runBusinessLogic({
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
        },
        competitors,
        rawKeywords: rawKeywordsForLogic,
        crawlData:   crawlRaw,
        clientGmb:   gmbRaw,
        competitorGmbs,
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
        competitors,
        businessData,
        seoData: {
          dr:               dr             != null ? String(dr)           : "—",
          referringDomains: referringDomains != null ? fmt(referringDomains) : "—",
          organicKeywords:  organicKeywords  != null ? fmt(organicKeywords)  : "—",
          organicTraffic:   organicTraffic   != null ? fmt(organicTraffic)   : "—",
          performanceMobile:  mobileScore  != null ? `${mobileScore}/100`  : "—",
          performanceDesktop: desktopScore != null ? `${desktopScore}/100` : "—",
        },
        crawlData:      crawlRaw,
        gmbData:        gmbRaw,
        keywordGapData: kwGapRaw,
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
    } else {
      aiSections = await generatePageAnalysis({
        url: safeUrl,
        domain,
        keyword: keywords[0] || keyword || domain,
        businessData,
        psiData,
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
