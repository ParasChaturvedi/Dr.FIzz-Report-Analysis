// src/app/api/ai/analyze/route.js
// Comprehensive SEO & GEO strategy report generator using Claude Opus 4.7.
// Generates all 14 sections matching the Dr.FIzz reference PDF format.

import { NextResponse } from "next/server";
import { claudeChatStream } from "@/lib/claude/client";
import { extractJsonObjectLoose } from "@/lib/perplexity/utils";

export const runtime = "nodejs";
export const maxDuration = 300;

function safeStr(v) {
  return String(v ?? "").trim();
}

function safeNum(v, fallback = null) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function buildDrFizzSystemPrompt() {
  return `You are Dr.FIzz — an elite SEO and GEO (Generative Engine Optimization) strategist with 20+ years of experience.
You generate comprehensive, data-driven SEO & GEO strategy reports for businesses.

Your analysis must be:
- Hyper-specific: reference exact numbers from the provided data
- Actionable: every recommendation has clear next steps
- Prioritized: rank by business impact
- Expert-level: better than any generic SEO tool

Return ONLY valid JSON. No markdown fences, no explanations outside the JSON.
All string fields must be valid JSON strings (escape any double quotes inside strings).`;
}

function buildAnalysisPrompt(metrics) {
  const {
    domain,
    performance,
    seo,
    coreWebVitals,
    keywords,
    competitors,
    backlinks,
    technical,
    content,
    mobile,
    security,
    gsc,
    onPageAudit,
    rankedKeywords,
    competitorDomains,
    domainRankOverview,
  } = metrics;

  const dr = safeNum(backlinks?.domainRating, 0);
  const organicKw = safeNum(domainRankOverview?.organicKeywords, safeNum(backlinks?.organicKeywords, 0));
  const organicTraffic = safeNum(domainRankOverview?.organicTraffic, safeNum(backlinks?.organicTraffic, 0));
  const referringDoms = safeNum(backlinks?.referringDomains, 0);
  const errors404 = safeNum(onPageAudit?.errors404, 0);
  const errors404Pct = safeNum(onPageAudit?.errors404Pct, 0);
  const redirectChains = safeNum(onPageAudit?.redirectChains, 0);
  const redirectChainsPct = safeNum(onPageAudit?.redirectChainsPct, 0);

  const drLabel =
    dr <= 10 ? "Extremely low" :
    dr <= 25 ? "Low" :
    dr <= 50 ? "Medium" :
    dr <= 70 ? "High" : "Very High";

  const topCompetitors = Array.isArray(competitorDomains)
    ? competitorDomains.slice(0, 5).map(c => `${c.domain} (${c.organicKeywords} kw, traffic: ${c.organicTraffic})`).join(", ")
    : "Not available";

  const topRankedKw = Array.isArray(rankedKeywords)
    ? rankedKeywords.slice(0, 10).map(k => `${k.keyword} (pos ${k.position}, vol ${k.searchVolume})`).join(", ")
    : "Not available";

  const topKwSuggestions = Array.isArray(keywords?.keywords)
    ? keywords.keywords.slice(0, 8).join(", ")
    : Array.isArray(keywords?.suggestions)
    ? keywords.suggestions.slice(0, 8).join(", ")
    : "Not available";

  const targetDr12mo = Math.max(20, Math.round(dr * 3 + 10));
  const targetDrStr = `${Math.max(15, targetDr12mo - 5)} to ${targetDr12mo + 5}`;

  return `
Generate a comprehensive SEO & GEO Strategy report for the domain: ${domain}

REAL-TIME DATA:
==============
Domain: ${domain}
Domain Rating (DR): ${dr}/100 (${drLabel})
Organic Keywords (US): ${organicKw}
Organic Traffic/mo: ${organicTraffic}
Referring Domains: ${referringDoms}
404 Errors: ${errors404} (${errors404Pct}% of pages)
Redirect Chains: ${redirectChains} (${redirectChainsPct}% of pages)
Broken Resources: ${safeNum(onPageAudit?.brokenResources, 0)}
Missing Title Tags: ${safeNum(onPageAudit?.missingTitle, 0)}
Missing Meta Descriptions: ${safeNum(onPageAudit?.missingDescription, 0)}
Missing H1 Tags: ${safeNum(onPageAudit?.missingH1, 0)}

Performance Score (Mobile): ${safeNum(performance?.mobileScore, "N/A")}
Performance Score (Desktop): ${safeNum(performance?.desktopScore, "N/A")}
LCP: ${safeStr(coreWebVitals?.lab?.lcp || coreWebVitals?.lcp)}
CLS: ${safeStr(coreWebVitals?.lab?.cls || coreWebVitals?.cls)}
FCP: ${safeStr(coreWebVitals?.lab?.fcp || coreWebVitals?.fcp)}

Title: ${safeStr(content?.title || seo?.title)}
Meta Description: ${safeStr(content?.metaDescription || seo?.metaDescription)}
H1 Tags: ${JSON.stringify(content?.h1s || seo?.h1s || [])}

Ranked Keywords (current): ${topRankedKw}
Keyword Suggestions: ${topKwSuggestions}
GSC Impressions: ${safeNum(gsc?.totalImpressions, "N/A")}
GSC Clicks: ${safeNum(gsc?.totalClicks, "N/A")}
GSC Avg Position: ${safeNum(gsc?.avgPosition, "N/A")}

Competitor Domains: ${topCompetitors}
Business Competitors: ${JSON.stringify(competitors?.businessCompetitors || [])}
Search Competitors: ${JSON.stringify(competitors?.searchCompetitors || [])}

Technical Issues: ${JSON.stringify(technical?.issueCounts || {})}
HTTPS: ${technical?.https ?? "N/A"}
Robots.txt: ${technical?.robotsTxt ?? "N/A"}
Sitemap: ${technical?.sitemap ?? "N/A"}
Structured Data: ${technical?.structuredData ?? "N/A"}

Security Headers: ${JSON.stringify(security?.headers || {})}
Mobile Friendly: ${mobile?.friendly ?? "N/A"}

DR Target (12 months): ${targetDrStr}
DR Current: ${dr}

Return this EXACT JSON structure (fill ALL fields with real data-driven content based on the metrics above):

{
  "domain": "${domain}",
  "generatedAt": "${new Date().toISOString()}",
  "overallScore": <number 0-100 based on DR, traffic, issues>,
  "scoreGrade": "<A+|A|B+|B|C+|C|D|F>",
  "baseline": {
    "domainRating": ${dr},
    "domainRatingLabel": "${drLabel}",
    "organicKeywords": ${organicKw},
    "organicKeywordsCountry": "United States",
    "organicTraffic": ${organicTraffic},
    "referringDomains": ${referringDoms},
    "dofollowNote": "<brief note about dofollow vs nofollow ratio>",
    "errors404": ${errors404},
    "errors404Pct": ${errors404Pct},
    "redirectChains": ${redirectChains},
    "redirectChainsPct": ${redirectChainsPct},
    "keyTakeaway": "<2-3 sentence bold callout summarizing baseline health and biggest gap>"
  },
  "competitorLandscape": {
    "businessCompetitors": [
      {"name": "<domain>", "drLevel": "<Extremely low|Low|Medium|High|Very High>", "description": "<1-2 sentence description of their SEO strength>", "threatLevel": "<low|medium|high>"}
    ],
    "searchCompetitors": [
      {"name": "<domain>", "positionRange": "<e.g. 3 to 8>", "description": "<1-2 sentence description>"}
    ],
    "localOpening": "<AI insight: what gap this business can exploit in local/niche search>"
  },
  "keywordStrategy": {
    "tier1": [
      {"keyword": "<primary commercial keyword>", "estVolume": "<e.g. 1,000 to 2,500>", "targetPage": "<Service landing page|Home page|Category page>"}
    ],
    "tier2": ["<neighborhood/geo keyword>"],
    "tier3": ["<informational blog content topic>"]
  },
  "contentArchitecture": {
    "siteStructure": ["${domain}/", "/${domain}/service-1/", "/${domain}/service-2/", "/${domain}/blog/", "/${domain}/about/", "/${domain}/contact/"],
    "pageRequirements": ["<required on-page element>"]
  },
  "competitiveIntelligence": {
    "whatWorks": ["<tactic that top competitors use successfully>"],
    "gapsToExploit": ["<weakness or gap in competitor coverage you can fill>"]
  },
  "technicalFoundation": {
    "issues": [
      {"priority": "CRITICAL", "issue": "<technical issue>", "action": "<specific fix>"},
      {"priority": "HIGH", "issue": "<technical issue>", "action": "<specific fix>"},
      {"priority": "MEDIUM", "issue": "<technical issue>", "action": "<specific fix>"}
    ],
    "onPageNote": "<brief note about on-page SEO checklist requirements>"
  },
  "authority": {
    "currentDR": ${dr},
    "targetDR12mo": "${targetDrStr}",
    "citationBuilding": "<months 1-2 citation building strategy>",
    "contentDrivenLinks": "<months 2-4 content-driven link building strategy>",
    "competitorLinkGap": "<ongoing competitor link gap analysis strategy>"
  },
  "localSearch": {
    "checklist": ["<Google Business Profile optimization action>"],
    "reviewTarget": 100,
    "reviewNote": "<note about review strategy and target>"
  },
  "executionRoadmap": [
    {"phase": "Phase 1", "period": "Months 1 to 2", "name": "Foundation", "tasks": ["<task>"]},
    {"phase": "Phase 2", "period": "Months 2 to 5", "name": "Content Build", "tasks": ["<task>"]},
    {"phase": "Phase 3", "period": "Months 3 to 8", "name": "Authority", "tasks": ["<task>"]},
    {"phase": "Phase 4", "period": "Months 6 to 12", "name": "Scale", "tasks": ["<task>"]}
  ],
  "measuringSuccess": {
    "kpis": [
      {"metric": "Domain Rating", "now": "${dr}", "sixMonths": "<realistic 6mo target>", "twelveMonths": "${targetDrStr}"},
      {"metric": "Organic Keywords (US)", "now": "${organicKw}", "sixMonths": "<realistic 6mo target>", "twelveMonths": "<realistic 12mo target>"},
      {"metric": "Organic Traffic / mo", "now": "${organicTraffic}", "sixMonths": "<realistic 6mo target>", "twelveMonths": "<realistic 12mo target>"},
      {"metric": "Referring Domains", "now": "${referringDoms}", "sixMonths": "<realistic 6mo target>", "twelveMonths": "<realistic 12mo target>"},
      {"metric": "AI Citations", "now": "0", "sixMonths": "3 to 5", "twelveMonths": "10 to 20"},
      {"metric": "Top 10 Rankings", "now": "${Math.min(organicKw, 5)}", "sixMonths": "<realistic 6mo target>", "twelveMonths": "<realistic 12mo target>"}
    ],
    "competitorBenchmark": {
      "name": "<name of top competitor domain>",
      "metrics": ["<DR metric>", "<backlinks metric>", "<referring domains metric>"]
    }
  },
  "contentBlueprint": {
    "items": [
      {"blogPost": "<blog post title>", "topKeyword": "<primary keyword>", "vol": <search volume number>, "pos": <position number>}
    ],
    "pattern": "<insight about the content pattern the leading competitor uses that you should replicate>"
  },
  "uncontestedTerritory": [
    {"service": "<service or topic>", "volume": "<e.g. 500 to 1,500 / mo>", "note": "<why this is an open opportunity>"}
  ],
  "geoAiVisibility": {
    "siteAiCitations": 0,
    "topCompetitorName": "<top competitor domain>",
    "topCompetitorCitations": "6+",
    "platforms": ["Google AI Overviews", "ChatGPT", "Perplexity", "Grok", "Copilot", "Gemini"],
    "howToEarn": ["<specific tactic to earn AI citations>"]
  },
  "quickWins": {
    "week1to4": {"label": "Week 1 to 4", "theme": "Highest ROI", "tasks": ["<high-ROI quick win task>"]},
    "week5to8": {"label": "Week 5 to 8", "theme": "Content Foundation", "tasks": ["<content foundation task>"]},
    "week9to16": {"label": "Week 9 to 16", "theme": "Authority Building", "tasks": ["<authority building task>"]},
    "week16plus": {"label": "Week 16 onwards", "theme": "Scale and Links", "tasks": ["<scale and link building task>"]}
  },
  "strategicPriority": {
    "assessment": "<2-3 sentence overall strategic assessment and biggest opportunity>",
    "priorities": [
      {"rank": 1, "action": "<most important action>", "timeline": "Week 1"},
      {"rank": 2, "action": "<second most important action>", "timeline": "Week 1 to 2"},
      {"rank": 3, "action": "<third most important action>", "timeline": "Month 1"},
      {"rank": 4, "action": "<fourth most important action>", "timeline": "Month 1 to 2"},
      {"rank": 5, "action": "<fifth most important action>", "timeline": "Month 2 to 3"}
    ]
  },
  "estimatedTrafficImpact": "<realistic estimate of organic traffic growth if recommendations are followed, e.g. 300 to 500% increase in 12 months>"
}

IMPORTANT: Generate 3-6 items per array field. Make all content domain-specific using the metrics provided. Reference actual numbers.
`.trim();
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));

    const domain = safeStr(body?.domain || body?.url || "");
    if (!domain) {
      return NextResponse.json({ error: "Missing domain or url" }, { status: 400 });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY is not configured" },
        { status: 500 }
      );
    }

    const metrics = {
      domain,
      url: safeStr(body?.url || ""),
      performance: body?.performance || {},
      seo: body?.seo || {},
      coreWebVitals: body?.coreWebVitals || body?.cwv || {},
      keywords: body?.keywords || {},
      competitors: body?.competitors || {},
      backlinks: body?.backlinks || {},
      technical: body?.technical || {},
      content: body?.content || {},
      mobile: body?.mobile || {},
      security: body?.security || {},
      gsc: body?.gsc || body?.googleSearchConsole || {},
      onPageAudit: body?.onPageAudit || {},
      rankedKeywords: body?.rankedKeywords || [],
      competitorDomains: body?.competitorDomains || [],
      domainRankOverview: body?.domainRankOverview || {},
      additional: body?.additional || {},
    };

    const systemPrompt = buildDrFizzSystemPrompt();
    const userPrompt = buildAnalysisPrompt(metrics);

    const { content } = await claudeChatStream({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 8000,
      timeoutMs: 280000,
      model: "claude-opus-4-7",
    });

    const parsed = extractJsonObjectLoose(content);

    if (!parsed) {
      return NextResponse.json(
        {
          error: "Analysis generated but JSON parsing failed",
          rawContent: content.slice(0, 2000),
        },
        { status: 422 }
      );
    }

    parsed.generatedAt = parsed.generatedAt || new Date().toISOString();
    parsed.domain = parsed.domain || domain;

    return NextResponse.json(
      {
        success: true,
        domain,
        analysis: parsed,
        model: "claude-opus-4-7",
        generatedAt: parsed.generatedAt,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[ai/analyze] error:", err);
    return NextResponse.json(
      { error: err?.message || "AI analysis failed" },
      { status: 500 }
    );
  }
}
