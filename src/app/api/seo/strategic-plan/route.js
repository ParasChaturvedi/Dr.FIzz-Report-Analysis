// src/app/api/seo/strategic-plan/route.js
// Uses Claude + all collected data (SEO + crawl + GMB + competitor) to generate
// a specific, non-generic SEO/GEO strategy plan.

import { NextResponse }     from "next/server";
import { claudeChatStream } from "@/lib/claude/client";

export const runtime    = "nodejs";
export const maxDuration = 120;

function truncate(obj, maxLen = 6000) {
  const s = typeof obj === "string" ? obj : JSON.stringify(obj || {});
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 3) + "...";
}

// ── Build structured prompt from all data sources ─────────────────────────────
function buildPrompt({
  domain,
  businessData,
  keywords,
  seoData,
  crawlData,
  gmbData,
  competitorAudit,
}) {
  const biz = businessData || {};
  const kws = Array.isArray(keywords) ? keywords.slice(0, 10) : [];

  // Extract key metrics
  const domainRating = seoData?.domainRankOverview?.rank ?? seoData?.domainMetrics?.rank ?? "unknown";
  const traffic      = seoData?.domainRankOverview?.organicTraffic ?? "unknown";
  const mobileScore  = seoData?.technicalSeo?.performanceScoreMobile ?? null;
  const desktopScore = seoData?.technicalSeo?.performanceScoreDesktop ?? null;

  // Crawl summary
  const crawl = crawlData || {};
  const crawlIssues = (crawl.summary?.commonIssues || []).map((i) => `${i.issue} (${i.count} pages)`);
  const schemaTypes = crawl.summary?.pagesWithSchemaTypes || [];

  // GMB summary
  const gmb = gmbData?.gmb || {};
  const gmbIssues = gmbData?.issues || [];
  const gmbRating = gmb.rating ?? null;
  const gmbReviews = gmbData?.reviews?.length ? gmbData.reviews.slice(0, 3).map((r) =>
    `"${(r.text || "").slice(0, 100)}" - ${r.rating}★`
  ) : [];

  // Competitor highlights
  const comps = (competitorAudit?.competitors || []).slice(0, 3).map((c) => ({
    domain:      c.domain,
    gmbRating:   c.gmb?.gmb?.rating ?? "no GMB",
    reviewCount: c.gmb?.gmb?.reviewCount ?? 0,
    schemaTypes: c.crawl?.summary?.pagesWithSchemaTypes || [],
    hasSitemap:  c.crawl?.hasSitemap ?? false,
    pageCount:   c.crawl?.pageCount ?? 0,
  }));

  return `You are a world-class SEO & GEO (Generative Engine Optimisation) strategist.
Your job is to generate a highly specific, data-driven strategy for the client.
DO NOT produce generic advice. Every recommendation must reference the actual data provided.
Be direct, actionable, and brutally honest about gaps.

## CLIENT OVERVIEW
- Domain: ${domain}
- Industry: ${biz.industry || biz.industrySector || "—"}
- Offering: ${biz.offering || biz.offeringType || "—"}
- Service: ${biz.category || biz.specificService || "—"}
- Target Keywords: ${kws.join(", ") || "not specified"}

## TECHNICAL SEO DATA
- Domain Rating: ${domainRating}
- Organic Traffic: ${traffic}
- Mobile Performance Score: ${mobileScore != null ? Math.round(mobileScore <= 1 ? mobileScore * 100 : mobileScore) + "/100" : "unknown"}
- Desktop Performance Score: ${desktopScore != null ? Math.round(desktopScore <= 1 ? desktopScore * 100 : desktopScore) + "/100" : "unknown"}
- Has Sitemap: ${crawl.hasSitemap ? "Yes" : "No"}
- Has robots.txt: ${crawl.hasRobots ? "Yes" : "No"}
- Crawl Blocked: ${crawl.crawlBlockedByRobots ? "YES — CRITICAL ISSUE" : "No"}
- Pages Crawled: ${crawl.pageCount || 0}
- Schema Types Found: ${schemaTypes.length > 0 ? schemaTypes.join(", ") : "NONE"}

## ON-PAGE ISSUES (from crawl)
${crawlIssues.length > 0 ? crawlIssues.map((i) => `• ${i}`).join("\n") : "• No major on-page issues detected"}
- Pages missing meta title: ${crawl.summary?.pagesMissingMetaTitle ?? 0}
- Pages missing meta description: ${crawl.summary?.pagesMissingMetaDesc ?? 0}
- Pages missing H1: ${crawl.summary?.pagesMissingH1 ?? 0}
- Pages marked noindex: ${crawl.summary?.pagesNoindex ?? 0}
- Total images missing alt text: ${crawl.summary?.totalImgsWithoutAlt ?? 0}
- Slug issues: ${crawl.summary?.slugIssuesCount ?? 0} pages

## GOOGLE MY BUSINESS
- GMB Found: ${gmb.found ? "Yes" : "NO — NOT LISTED"}
- Claimed/Verified: ${gmb.isVerified ? "Yes" : "No"}
- Rating: ${gmbRating ? `${gmbRating}★ (${gmb.reviewCount || 0} reviews)` : "N/A"}
- Phone Listed: ${gmb.phone ? "Yes" : "No"}
- Address Listed: ${gmb.address ? "Yes" : "No"}
- Hours Set: ${gmb.hoursAvailable ? "Yes" : "No"}
- Photos: ${gmb.photos ? "Yes" : "No"}
${gmbReviews.length > 0 ? `Recent reviews:\n${gmbReviews.map((r) => `  - ${r}`).join("\n")}` : ""}
GMB Issues: ${gmbIssues.length > 0 ? gmbIssues.map((i) => `• ${i}`).join("\n") : "None"}
Business Directories Listed: ${gmbData?.listedDirectoryCount ?? 0}/8 checked

## COMPETITOR DATA
${comps.length > 0 ? comps.map((c) => `
### ${c.domain}
- GMB: ${typeof c.gmbRating === "number" ? `${c.gmbRating}★ (${c.reviewCount} reviews)` : c.gmbRating}
- Schema: ${c.schemaTypes.length > 0 ? c.schemaTypes.join(", ") : "none"}
- Sitemap: ${c.hasSitemap ? "yes" : "no"}
- Pages crawled: ${c.pageCount}
`).join("") : "No competitor data available"}

## YOUR TASK
Generate a strategic SEO + GEO plan with these exact sections:

### 1. CRITICAL FIXES (do these first — 0–2 weeks)
List max 5 issues that are blocking immediate ranking or visibility. For each: what it is, why it matters, exact fix.

### 2. ON-PAGE SEO ACTION PLAN (2–6 weeks)
Specific page-by-page recommendations based on the crawl data. Reference actual URLs/issues found.

### 3. GOOGLE MY BUSINESS & LOCAL SEO
Specific steps to optimise the GMB profile and get listed in missing directories. Include review strategy.

### 4. COMPETITOR GAP ANALYSIS
Where are competitors ahead? What can be copied, improved, or leapfrogged? Be specific.

### 5. CONTENT STRATEGY (avoid being generic)
Based on the actual keyword data and industry: what specific content to create, in what format, targeting which intent. Name specific article/page ideas.

### 6. GEO (Generative Engine Optimisation)
How to make this business appear in AI-generated answers (ChatGPT, Google AI Overviews, Perplexity). What schema, E-E-A-T signals, and content structures are needed.

### 7. 90-DAY PRIORITY ROADMAP
A week-by-week action list for the first 90 days, prioritised by impact.

Keep the tone direct, specific, and data-backed. No filler phrases like "it's important to…" or "you should consider…" — just tell them exactly what to do.`;
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function POST(request) {
  try {
    const body = await request.json();
    const {
      domain,
      businessData,
      keywords    = [],
      seoData     = null,
      crawlData   = null,
      gmbData     = null,
      competitorAudit = null,
    } = body;

    if (!domain) {
      return NextResponse.json({ error: "domain is required" }, { status: 400 });
    }

    const prompt = buildPrompt({ domain, businessData, keywords, seoData, crawlData, gmbData, competitorAudit });

    const { content } = await claudeChatStream({
      messages: [
        { role: "system", content: "You are a senior SEO & GEO strategist. Generate highly specific, data-backed plans. No generic advice." },
        { role: "user",   content: prompt },
      ],
      max_tokens: 4000,
      timeoutMs:  90000,
      model: "claude-sonnet-4-6", // Sonnet for cost-efficiency on longer text generation
    });

    return NextResponse.json({
      domain,
      plan: content,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[strategic-plan] Error:", err);
    return NextResponse.json({ error: err?.message || "plan generation failed" }, { status: 500 });
  }
}
