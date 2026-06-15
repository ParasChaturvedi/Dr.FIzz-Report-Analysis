// src/app/api/seo/competitor-audit/route.js
// Runs website crawl + GMB check for each competitor domain.
// Returns structured comparison data against the target domain.

import { NextResponse } from "next/server";

export const runtime    = "nodejs";
export const maxDuration = 120;

const MAX_COMPETITORS = 5;

// A competitor entry can be a domain ("acme.com") OR a business name ("Acme Corp").
function looksLikeDomain(s) {
  return /^([a-z0-9-]+\.)+[a-z]{2,}(\/.*)?$/i.test(String(s || "").replace(/^https?:\/\//, "").trim());
}

// ── Audit one competitor (crawl + GMB) via internal HTTP calls ───────────────
// Works whether the competitor is a domain or a plain business name: the GMB
// lookup is searched by businessName so Step-4 business competitors (often
// entered as names) are GMB-analysed in real time just like the client.
async function auditOneDomain(competitor, keywords = [], location = "India", baseUrl = "") {
  const isDomain = looksLikeDomain(competitor);
  const domain   = isDomain ? String(competitor).replace(/^https?:\/\//, "").trim() : "";
  const name     = isDomain ? "" : String(competitor).trim();

  // skipDirectories: competitors don't need the ~14-call directory SERP fan-out
  // (not shown in the comparison) — saves DataForSEO credits per competitor.
  const gmbBody = isDomain
    ? { domain, location, skipDirectories: true }
    : { domain: "", businessName: name, location, skipDirectories: true };

  const [crawlResult, gmbResult] = await Promise.allSettled([
    // Crawl only makes sense for a real domain.
    isDomain
      ? fetch(`${baseUrl}/api/seo/website-crawl`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain, keywords }),
          signal: AbortSignal.timeout(85000),
        }).then(r => r.ok ? r.json() : Promise.reject(new Error(`crawl ${r.status}`)))
      : Promise.resolve({ skipped: "no domain — business name only" }),
    fetch(`${baseUrl}/api/seo/gmb`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(gmbBody),
      signal: AbortSignal.timeout(55000),
    }).then(r => r.ok ? r.json() : Promise.reject(new Error(`gmb ${r.status}`))),
  ]);

  return {
    domain: domain || competitor,
    name:   name || domain || competitor,
    crawl:  crawlResult.status === "fulfilled" ? crawlResult.value : { error: crawlResult.reason?.message },
    gmb:    gmbResult.status   === "fulfilled" ? gmbResult.value   : { error: gmbResult.reason?.message },
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

    const baseUrl = request.nextUrl.origin; // e.g. "https://drfizz.vercel.app"

    const allDomains = [
      targetDomain,
      ...competitors.slice(0, MAX_COMPETITORS - 1),
    ];

    // Run all audits in parallel (target + up to 4 competitors)
    const results = await Promise.all(
      allDomains.map((d) => auditOneDomain(d, keywords, location, baseUrl))
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
