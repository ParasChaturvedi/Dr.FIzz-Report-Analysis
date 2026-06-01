// src/app/api/seo/strategic-plan/route.js
// Advanced Claude-powered SEO + GEO strategic plan — v2
// Uses all collected data: SEO metrics, crawl audit (with per-page details),
// GMB status + sentiment, competitor comparison, keyword gap, E-E-A-T signals.
// Returns structured JSON plan for dashboard rendering + markdown for display.

import { NextResponse }     from "next/server";
import { claudeChatStream } from "@/lib/claude/client";

export const runtime    = "nodejs";
export const maxDuration = 120;

function safe(obj, maxLen = 5000) {
  const s = typeof obj === "string" ? obj : JSON.stringify(obj || {});
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 3) + "...";
}

// ── Build ultra-detailed prompt ───────────────────────────────────────────────
function buildPrompt(params) {
  const {
    domain, businessData, keywords,
    seoData, crawlData, gmbData, competitorAudit, keywordGap,
  } = params;

  const biz  = businessData || {};
  const kws  = (Array.isArray(keywords) ? keywords : []).slice(0, 10);
  const seo  = seoData || {};
  const crawl = crawlData || {};
  const gmb   = gmbData || {};
  const ca    = competitorAudit || {};
  const kg    = keywordGap || {};

  // SEO metrics
  const dr = seo?.domainRankOverview?.rank ?? "unknown";
  const traffic = seo?.domainRankOverview?.organicTraffic ?? "unknown";
  const mScore  = seo?.technicalSeo?.performanceScoreMobile ?? null;
  const dScore  = seo?.technicalSeo?.performanceScoreDesktop ?? null;
  const toScore = v => v != null ? Math.round(v <= 1 ? v * 100 : v) + "/100" : "unknown";

  // Top crawl pages with issues
  const topIssuePages = (crawl.pages || [])
    .filter(p => p.issueCount > 0)
    .sort((a,b) => b.issueCount - a.issueCount)
    .slice(0, 5)
    .map(p => `  - ${p.url}\n    Issues: ${(p.issues||[]).slice(0,3).join("; ")}`)
    .join("\n");

  // E-E-A-T signals
  const eeat = crawl.eeatSummary || {};
  const eeatSignals = eeat.signals || {};
  const eeatMissing = (crawl.pages?.[0]?.eeat?.missing || []).join(", ");

  // GMB details
  const gmbInfo = gmb.gmb || {};
  const sentiment = gmb.sentiment || null;
  const gmbIssues = (gmb.issues || []).map(i => `• [${i.severity?.toUpperCase()}] ${i.issue}`).join("\n");
  const reviewInsights = sentiment ? `
  Sentiment: ${sentiment.overallSentiment} (${sentiment.sentimentScore}/100)
  Customers praise: ${(sentiment.topPraises||[]).join(", ")}
  Customers complain about: ${(sentiment.topComplaints||[]).join(", ")}
  Urgent: ${(sentiment.urgentIssues||[]).join(", ") || "none"}` : "  Review sentiment analysis not available";

  const completenessScore = gmb.completeness?.score ?? "N/A";

  // Competitor data
  const comps = (ca.competitors || []).slice(0, 3).map(c => `
### ${c.domain}
  - GMB: ${c.gmb?.gmb?.rating ? `${c.gmb.gmb.rating}★ (${c.gmb.gmb.reviewCount} reviews)` : "no GMB"}
  - Schema types: ${(c.crawl?.summary?.pagesWithSchemaTypes||[]).join(", ") || "none"}
  - Health score: ${c.crawl?.healthScore ?? "—"}
  - Pages: ${c.crawl?.pageCount ?? "—"}
  - Avg word count: ${c.crawl?.summary?.avgWordCount ?? "—"} words/page
  - Missing meta titles: ${c.crawl?.summary?.pagesMissingMetaTitle ?? "—"}`).join("\n");

  // Keyword gap
  const gapKws = (kg.gapKeywords || []).slice(0, 10).map(k =>
    `  - "${k.keyword}" (vol: ${k.volume}, diff: ${Math.round((k.difficulty||0)*100)}%, intent: ${k.intent}, found in: ${(k.foundIn||[]).join(", ")})`
  ).join("\n");

  const easyWins = (kg.easyWins || []).slice(0, 5).map(k =>
    `  - "${k.keyword}" — vol ${k.volume}, comp rank #${k.position||"?"}`
  ).join("\n");

  const paaQs = (kg.paaQuestions || []).slice(0, 8).map(q => `  - "${q.question}"`).join("\n");

  // Duplicate content
  const dupes = (crawl.duplicates || []).slice(0, 3).map(d =>
    `  - Duplicate ${d.type}: "${d.value}" — found on ${d.urls.join(", ")}`
  ).join("\n");

  // Broken links
  const broken = (crawl.brokenLinks || []).map(b =>
    `  - ${b.url} → ${b.status}`
  ).join("\n");

  return `You are a world-class SEO + GEO (Generative Engine Optimisation) strategist with 20 years of experience.
You are generating a data-specific, ruthlessly actionable strategy for a real client.
NEVER give generic advice. Every recommendation must reference the actual data.
Use the client's real numbers, real pages, real keywords. Be direct and specific.

═══════════════════════════════════════════════════════
CLIENT PROFILE
═══════════════════════════════════════════════════════
Domain:           ${domain}
Industry:         ${biz.industry || biz.industrySector || "—"}
Offering Type:    ${biz.offering || biz.offeringType || "—"}
Specific Service: ${biz.category || biz.specificService || "—"}
Target Keywords:  ${kws.join(", ") || "not specified"}

═══════════════════════════════════════════════════════
DOMAIN AUTHORITY & TRAFFIC
═══════════════════════════════════════════════════════
Domain Rating:         ${dr}
Organic Traffic (est): ${typeof traffic === "number" ? traffic.toLocaleString() : traffic}
Organic Keywords:      ${seo?.domainRankOverview?.organicKeywords ?? "unknown"}
Mobile PSI Score:      ${toScore(mScore)}
Desktop PSI Score:     ${toScore(dScore)}

═══════════════════════════════════════════════════════
WEBSITE CRAWL — HEALTH SCORE: ${crawl.healthScore ?? "N/A"}/100
═══════════════════════════════════════════════════════
Pages Crawled:              ${crawl.pageCount || 0}
Has Sitemap:                ${crawl.hasSitemap ? "Yes" : "NO — MISSING"}
Has robots.txt:             ${crawl.hasRobots ? "Yes" : "No"}
Crawl Blocked:              ${crawl.crawlBlockedByRobots ? "YES — CRITICAL: Googlebot can't crawl site" : "No"}
Schema Types Found:         ${(crawl.summary?.pagesWithSchemaTypes||[]).join(", ") || "NONE — Major GEO gap"}
Missing Meta Titles:        ${crawl.summary?.pagesMissingMetaTitle ?? 0} pages
Missing Meta Descriptions:  ${crawl.summary?.pagesMissingMetaDesc ?? 0} pages
Missing H1:                 ${crawl.summary?.pagesMissingH1 ?? 0} pages
Multiple H1s:               ${crawl.summary?.pagesMultipleH1 ?? 0} pages
No Canonical Tag:           ${crawl.summary?.pagesNoCanonical ?? 0} pages
Noindex Pages:              ${crawl.summary?.pagesNoindex ?? 0} pages
Images Without Alt:         ${crawl.summary?.totalImgsWithoutAlt ?? 0} total
Images Without Dimensions:  ${crawl.summary?.totalImgsWithoutDims ?? 0} total (CLS risk)
Thin Content (<200 words):  ${crawl.summary?.thinContentCount ?? 0} pages
Average Word Count:         ${crawl.summary?.avgWordCount ?? 0} words/page
Slug Issues:                ${crawl.summary?.slugIssuesCount ?? 0} pages
Duplicate Meta Titles:      ${(crawl.duplicates||[]).filter(d=>d.type==="title").length}
Duplicate Meta Desc:        ${(crawl.duplicates||[]).filter(d=>d.type==="description").length}
Broken Links Found:         ${(crawl.brokenLinks||[]).length}
Orphan Pages:               ${(crawl.orphanPages||[]).length}

${broken ? `BROKEN LINKS:\n${broken}\n` : ""}
${dupes  ? `DUPLICATE CONTENT:\n${dupes}\n`  : ""}
${topIssuePages ? `PAGES WITH MOST ISSUES:\n${topIssuePages}\n` : ""}

E-E-A-T SIGNALS (homepage):
  Missing: ${eeatMissing || "none detected"}
  Score: ${eeat.avgScore ?? "—"}/${eeat.maxScore ?? 9}

CWV ISSUES: ${crawl.summary?.cwvIssuesCount ?? 0} pages have Core Web Vital problems

═══════════════════════════════════════════════════════
GOOGLE MY BUSINESS — Completeness: ${completenessScore}/100
═══════════════════════════════════════════════════════
Found:           ${gmbInfo.found ? "Yes" : "NO"}
Verified:        ${gmbInfo.isVerified ? "Yes" : "No"}
Rating:          ${gmbInfo.rating ? `${gmbInfo.rating}★ (${gmbInfo.reviewCount} reviews)` : "N/A"}
Category:        ${gmbInfo.category || "—"}
Phone:           ${gmbInfo.phone ? "Yes" : "Missing"}
Address:         ${gmbInfo.address ? "Yes" : "Missing"}
Hours Set:       ${gmbInfo.hoursAvailable ? "Yes" : "Missing"}
Photos:          ${gmbInfo.hasPhotos ? "Yes" : "Missing"}
Review Velocity: ${gmb.reviewVelocity ? `${gmb.reviewVelocity} reviews/month` : "unknown"}
Unreplied Reviews: ${gmb.unrepliedReviewCount ?? 0}
Directory Listings: ${gmb.listedDirectoryCount ?? 0}/${(gmb.directories||[]).length}

REVIEW INSIGHTS:${reviewInsights}

GMB ISSUES:
${gmbIssues || "None"}

Q&A on GMB: ${(gmb.qa||[]).length} questions, ${(gmb.qa||[]).filter(q=>!q.hasAnswer).length} unanswered

═══════════════════════════════════════════════════════
COMPETITOR DATA
═══════════════════════════════════════════════════════
${comps || "No competitor data available"}

═══════════════════════════════════════════════════════
KEYWORD GAP (competitors rank, you don't)
═══════════════════════════════════════════════════════
Total Gap Keywords Found: ${kg.summary?.totalGapKeywords ?? 0}
Top Gaps By Volume:
${gapKws || "  No keyword gap data"}

EASY WINS (low competition, good volume):
${easyWins || "  None identified"}

PEOPLE ALSO ASK (content opportunities):
${paaQs || "  No PAA data"}

═══════════════════════════════════════════════════════

Now generate the strategic plan. Follow EXACTLY this structure with section headers:

## 🚨 CRITICAL FIXES (Week 1–2)
[List the top 5–7 issues that are actively hurting rankings RIGHT NOW. Be specific: name the exact page, URL, or file. Explain the measurable impact. State the exact fix.]

## 📄 ON-PAGE SEO ACTION PLAN (Week 2–6)
[Per-page recommendations based on actual crawl data. For each issue type, give the exact fix with examples. Include meta title templates using the target keywords.]

## 🗺️ GOOGLE MY BUSINESS & LOCAL SEO
[Step-by-step GMB optimisation: what to fill in, how to get more reviews, how to reply. Include exact response templates for negative reviews. Directory submission priority list.]

## 🔑 KEYWORD STRATEGY (based on actual gap data)
[Map the gap keywords to specific new pages or existing page improvements. Group by intent. Give exact title + URL slug recommendations for the top 5 new pages to create.]

## 📝 CONTENT CALENDAR (next 90 days)
[Specific article titles, target keywords, word counts, and content type (blog/landing/FAQ) — 12 pieces total, based on the PAA questions and keyword gaps above.]

## 🤖 GEO — Generative Engine Optimisation
[How to appear in ChatGPT, Google AI Overviews, Perplexity. What schema types to add, what E-E-A-T signals are missing, how to write content that gets cited by AI. Specific schema templates for this business type.]

## 🏆 COMPETITOR TAKEDOWN PLAN
[For each competitor: what they do better, what you can leapfrog. Give specific tactics — not "create better content" but "target keyword X with a comparison page at /[slug] because competitor Y ranks #3 with thin 400-word content".]

## 📅 90-DAY PRIORITY ROADMAP
[Week-by-week action list. Month 1: technical fixes. Month 2: content + GMB. Month 3: link building + schema. Be specific — name the tasks, estimated hours, and expected outcome.]

## 📊 EXPECTED OUTCOMES
[Based on the data, what traffic/ranking improvements are realistic in 30/60/90 days? What's the biggest single lever for this specific site?]

Write in a direct, expert tone. Use real numbers from the data. No filler.`;
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function POST(request) {
  try {
    const body = await request.json();
    const {
      domain, businessData, keywords = [],
      seoData = null, crawlData = null, gmbData = null,
      competitorAudit = null, keywordGap = null,
    } = body;

    if (!domain) return NextResponse.json({ error: "domain required" }, { status: 400 });

    const prompt = buildPrompt({ domain, businessData, keywords, seoData, crawlData, gmbData, competitorAudit, keywordGap });

    const { content } = await claudeChatStream({
      messages: [
        { role: "system", content: "You are a senior SEO + GEO strategist. Generate highly specific, data-backed plans using the exact metrics provided. No generic advice." },
        { role: "user",   content: prompt },
      ],
      max_tokens: 5000,
      timeoutMs:  90000,
      model: "claude-sonnet-4-6",
    });

    // Parse sections for structured display
    const sections = {};
    const sectionRe = /^## (.+)$/gm;
    const parts = content.split(sectionRe);
    for (let i = 1; i < parts.length; i += 2) {
      const key = parts[i].replace(/[^\w\s]/g, "").trim().toLowerCase().replace(/\s+/g, "_");
      sections[key] = parts[i + 1]?.trim() || "";
    }

    return NextResponse.json({
      domain,
      plan: content,
      sections,
      generatedAt: new Date().toISOString(),
      dataSourcesUsed: {
        seo:            !!seoData,
        crawl:          !!crawlData,
        gmb:            !!gmbData,
        competitorAudit:!!competitorAudit,
        keywordGap:     !!keywordGap,
      },
    });
  } catch (err) {
    console.error("[strategic-plan] Error:", err);
    return NextResponse.json({ error: err?.message || "plan generation failed" }, { status: 500 });
  }
}
