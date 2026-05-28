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

export const runtime = "nodejs";
export const maxDuration = 120;

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
      max_tokens: 6000,
      timeoutMs: 90000,
    });

    // Extract JSON — try direct parse, then largest {...} block
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

// ─── Website-level AI analysis ────────────────────────────────────────────────

async function generateWebsiteAnalysis({ domain, keywords, competitors, businessData, seoData }) {
  const primaryKw = (keywords || []).slice(0, 5).join(", ") || domain;
  const competitorList = (competitors || []).slice(0, 5).join(", ") || "major industry players";
  const industry = businessData?.industrySector || businessData?.industry || "business";

  const systemPrompt = `You are ItzFizz Intelligence, an elite SEO & GEO strategy engine.
You produce highly specific, actionable SEO strategy for businesses.
Always return STRICT JSON matching the requested schema.
For keyword search volumes: always provide realistic industry-knowledge estimates (format: "1K–5K/mo", "500–2K/mo", "200–500/mo", "<200/mo"). Never use "—" for keyword volumes.
For content blueprint vol/pos fields: provide realistic estimates like "800/mo", "Top 10".
Only use "—" for site-specific live metrics you cannot know (Domain Rating, referring domains, live traffic counts).
Do not mention Claude, Anthropic, or any AI provider by name.`;

  const realMetrics = seoData ? `
Live Metrics (use these real numbers in your analysis):
  Domain Rating:      ${seoData.dr || "—"}
  Referring Domains:  ${seoData.referringDomains || "—"}
  Organic Keywords:   ${seoData.organicKeywords || "—"}
  Organic Traffic:    ${seoData.organicTraffic || "—"}
  Mobile Score:       ${seoData.performanceMobile || "—"}
  Desktop Score:      ${seoData.performanceDesktop || "—"}` : "";

  const userPrompt = `Analyze this business and produce a comprehensive SEO strategy.

Domain: ${domain}
Industry: ${industry}
Primary Keywords: ${primaryKw}
Competitors: ${competitorList}
Business Offering: ${businessData?.offeringType || "services"}
Location: ${businessData?.location || ""}${realMetrics}

Return JSON with exactly these keys:
{
  "competitorLandscape": {
    "localCompetitors": [{"name": "...", "domain": "...", "description": "...", "strength": "..."}],
    "nationalPlatforms": [{"name": "...", "description": "...", "threat": "..."}],
    "localOpening": "one paragraph about the local opportunity"
  },
  "keywordStrategy": {
    "tier1": [{"keyword": "...", "volume": "...", "targetPageType": "..."}],
    "tier2Neighborhood": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
    "tier3Informational": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"]
  },
  "contentArchitecture": {
    "siteStructure": [{"page": "...", "url": "...", "purpose": "..."}],
    "checklist": ["item1", "item2", "item3", "item4", "item5"]
  },
  "competitiveIntelligence": {
    "whatWorksForThem": ["point1", "point2", "point3", "point4"],
    "gapsYouCanExploit": ["gap1", "gap2", "gap3", "gap4"]
  },
  "technicalPriorities": [
    {"priority": "CRITICAL", "issue": "...", "action": "..."},
    {"priority": "HIGH", "issue": "...", "action": "..."},
    {"priority": "MEDIUM", "issue": "...", "action": "..."}
  ],
  "linkBuilding": {
    "citationBuilding": ["item1", "item2", "item3"],
    "contentDrivenLinks": ["item1", "item2", "item3"],
    "competitorLinkGap": ["item1", "item2", "item3"]
  },
  "localSearch": {
    "gbpChecklist": ["item1", "item2", "item3", "item4", "item5"],
    "reviewTarget": "specific review target with platform and count"
  },
  "roadmap": [
    {"phase": 1, "title": "...", "duration": "Week 1", "actions": ["...", "...", "..."]},
    {"phase": 2, "title": "...", "duration": "Week 2", "actions": ["...", "...", "..."]},
    {"phase": 3, "title": "...", "duration": "Week 3", "actions": ["...", "...", "..."]},
    {"phase": 4, "title": "...", "duration": "Week 4", "actions": ["...", "...", "..."]}
  ],
  "contentBlueprint": [
    {"blogPost": "...", "topKeyword": "...", "vol": "...", "pos": "..."},
    {"blogPost": "...", "topKeyword": "...", "vol": "...", "pos": "..."},
    {"blogPost": "...", "topKeyword": "...", "vol": "...", "pos": "..."}
  ],
  "uncontested": [
    {"page": "...", "keyword": "...", "volume": "..."},
    {"page": "...", "keyword": "...", "volume": "..."},
    {"page": "...", "keyword": "...", "volume": "..."}
  ],
  "geoFrontier": {
    "domainAICitations": "number or estimate",
    "competitorAICitations": "number or estimate",
    "howToEarnCitations": ["step1", "step2", "step3", "step4", "step5"]
  },
  "quickWins180": [
    {"week": "Week 1–2", "actions": ["...", "...", "..."]},
    {"week": "Week 3–4", "actions": ["...", "...", "..."]},
    {"week": "Month 2", "actions": ["...", "...", "..."]},
    {"week": "Month 3–6", "actions": ["...", "...", "..."]}
  ],
  "strategicPriorities": [
    {"priority": "01", "title": "...", "description": "..."},
    {"priority": "02", "title": "...", "description": "..."},
    {"priority": "03", "title": "...", "description": "..."}
  ]
}`;

  return generateWithAI(systemPrompt, userPrompt, {
    competitorLandscape: { localCompetitors: [], nationalPlatforms: [], localOpening: "" },
    keywordStrategy: { tier1: [], tier2Neighborhood: [], tier3Informational: [] },
    contentArchitecture: { siteStructure: [], checklist: [] },
    competitiveIntelligence: { whatWorksForThem: [], gapsYouCanExploit: [] },
    technicalPriorities: [],
    linkBuilding: { citationBuilding: [], contentDrivenLinks: [], competitorLinkGap: [] },
    localSearch: { gbpChecklist: [], reviewTarget: "" },
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

    if (needFreshPsi && psiMobileRaw) {
      mobileScore  = normScore(psiMobileRaw?.performanceScore);
      desktopScore = normScore(psiDesktopRaw?.performanceScore);
      cwvLab = psiMobileRaw?.coreWebVitalsLab ?? psiDesktopRaw?.coreWebVitalsLab ?? {};
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

    // ── Generate AI sections ──────────────────────────────────────────────────
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
      });
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
      baselineMetrics,
      psiData,
      keywords,
      competitors,
      businessData: businessData || {},
      ...aiSections,
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
