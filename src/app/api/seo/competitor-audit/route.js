// src/app/api/seo/competitor-audit/route.js
// Runs website crawl + GMB check for each competitor domain.
// Returns structured comparison data against the target domain.

import { NextResponse } from "next/server";
import { crawlDomain }  from "@/app/api/seo/website-crawl/route";
import { checkGmb }     from "@/app/api/seo/gmb/route";

export const runtime    = "nodejs";
export const maxDuration = 120;

const MAX_COMPETITORS = 5;

// ── Audit one domain (crawl + GMB) ────────────────────────────────────────────
async function auditOneDomain(domain, keywords = [], location = "India") {
  const [crawlResult, gmbResult] = await Promise.allSettled([
    crawlDomain(domain, keywords),
    checkGmb(domain, "", location),
  ]);

  return {
    domain,
    crawl: crawlResult.status === "fulfilled"  ? crawlResult.value  : { error: crawlResult.reason?.message },
    gmb:   gmbResult.status   === "fulfilled"  ? gmbResult.value    : { error: gmbResult.reason?.message },
  };
}

// ── Build a comparative insight ────────────────────────────────────────────────
function compareAudit(target, competitors) {
  // For each SEO signal, compare target vs competitors
  const signals = [];

  // Schema adoption
  const targetHasSchema = (target.crawl?.summary?.pagesWithSchemaTypes?.length || 0) > 0;
  const compWithSchema  = competitors.filter((c) => (c.crawl?.summary?.pagesWithSchemaTypes?.length || 0) > 0).length;
  signals.push({
    signal:  "Structured Data (Schema)",
    target:  targetHasSchema ? "✓ Present" : "✗ Missing",
    competitors: `${compWithSchema}/${competitors.length} have it`,
    gap: !targetHasSchema && compWithSchema > 0 ? "high" : "none",
  });

  // GMB rating
  const targetRating = target.gmb?.gmb?.rating ?? null;
  const compRatings  = competitors.map((c) => c.gmb?.gmb?.rating).filter((r) => r != null);
  const avgCompRating = compRatings.length ? (compRatings.reduce((a, b) => a + b, 0) / compRatings.length).toFixed(1) : null;
  signals.push({
    signal:  "GMB Rating",
    target:  targetRating ? `${targetRating}★` : "No GMB",
    competitors: avgCompRating ? `avg ${avgCompRating}★` : "No data",
    gap: targetRating && avgCompRating && targetRating < avgCompRating ? "medium" : "none",
  });

  // Missing meta descriptions
  const targetMissingDesc = target.crawl?.summary?.pagesMissingMetaDesc || 0;
  const targetTotal       = target.crawl?.pageCount || 1;
  const targetDescPct     = Math.round((targetMissingDesc / targetTotal) * 100);
  signals.push({
    signal:  "Pages Missing Meta Description",
    target:  `${targetMissingDesc}/${targetTotal} pages (${targetDescPct}%)`,
    competitors: "N/A",
    gap: targetDescPct > 30 ? "high" : targetDescPct > 10 ? "medium" : "none",
  });

  // Missing H1s
  const targetMissingH1 = target.crawl?.summary?.pagesMissingH1 || 0;
  const targetH1Pct     = Math.round((targetMissingH1 / targetTotal) * 100);
  signals.push({
    signal:  "Pages Missing H1",
    target:  `${targetMissingH1}/${targetTotal} pages (${targetH1Pct}%)`,
    competitors: "N/A",
    gap: targetH1Pct > 20 ? "high" : "none",
  });

  // Alt text issues
  const targetAltIssues = target.crawl?.summary?.totalImgsWithoutAlt || 0;
  signals.push({
    signal:  "Images Without Alt Text",
    target:  `${targetAltIssues} images`,
    competitors: "N/A",
    gap: targetAltIssues > 5 ? "medium" : "none",
  });

  return signals;
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function POST(request) {
  try {
    const body = await request.json();
    const {
      targetDomain,
      competitors = [],
      keywords    = [],
      location    = "India",
    } = body;

    if (!targetDomain) {
      return NextResponse.json({ error: "targetDomain is required" }, { status: 400 });
    }

    const allDomains = [
      targetDomain,
      ...competitors.slice(0, MAX_COMPETITORS - 1),
    ];

    // Run all audits in parallel (target + up to 4 competitors)
    const results = await Promise.all(
      allDomains.map((d) => auditOneDomain(d, keywords, location))
    );

    const [targetAudit, ...competitorAudits] = results;

    const comparison = compareAudit(targetAudit, competitorAudits);

    return NextResponse.json({
      target:      targetAudit,
      competitors: competitorAudits,
      comparison,
      auditedAt:   new Date().toISOString(),
    });
  } catch (err) {
    console.error("[competitor-audit] Error:", err);
    return NextResponse.json({ error: err?.message || "audit failed" }, { status: 500 });
  }
}
