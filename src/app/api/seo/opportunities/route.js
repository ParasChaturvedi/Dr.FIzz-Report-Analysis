// src/app/api/seo/opportunities/route.js
//
// On Vercel, serverless functions can't run background jobs that outlive
// the HTTP response. The old enqueue-and-poll pattern (in-memory Map + fire-
// and-forget runOpportunitiesScan) therefore never delivers results.
//
// Fix: run the scan SYNCHRONOUSLY within the request, wait for it to finish,
// then return the results in a single 200 response.

import { NextResponse } from "next/server";
import { normalizeToHttps, getHostname } from "@/lib/seo/discovery";
import { createScan, upsertOpportunitiesSnapshot } from "@/lib/seo/snapshots.store";
import { runOpportunitiesScan } from "@/lib/seo/jobs/scan-opportunities";

export const runtime     = "nodejs";
export const maxDuration = 120; // scan can take up to 2 min on large sites

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const websiteUrl     = normalizeToHttps(body?.websiteUrl);
    const allowSubdomains = body?.allowSubdomains == null ? true : Boolean(body.allowSubdomains);

    if (!websiteUrl) {
      return NextResponse.json({ error: "websiteUrl is required" }, { status: 400 });
    }

    const hostname = getHostname(websiteUrl);
    if (!hostname) {
      return NextResponse.json({ error: "Invalid websiteUrl" }, { status: 400 });
    }

    // Create scan record and run it synchronously (await completion)
    const scan = createScan({
      kind:          "opportunities",
      websiteUrl,
      hostname,
      allowSubdomains,
      mode:          "published",
    });

    upsertOpportunitiesSnapshot(hostname, {
      scanId:        scan.scanId,
      status:        "running",
      mode:          "published",
      allowSubdomains,
      diagnostics:   { stage: "starting" },
      blogs:         [],
      pages:         [],
    });

    // ── Run synchronously — await full completion ──────────────────────────
    await runOpportunitiesScan({
      inFlightKey:   `opportunities|${hostname}|sub=${allowSubdomains ? 1 : 0}|mode=published`,
      scanId:        scan.scanId,
      websiteUrl,
      allowSubdomains,
      mode:          "published",
    }).catch((err) => {
      console.error("[opportunities] scan error:", err?.message);
    });

    // Read back results from the store
    const { getLatestOpportunities } = await import("@/lib/seo/snapshots.store");
    const result = getLatestOpportunities(hostname, {
      ttlMs:         24 * 60 * 60 * 1000,
      mode:          "published",
      allowSubdomains,
    });

    const blogs = Array.isArray(result?.blogs) ? result.blogs : [];
    const pages = Array.isArray(result?.pages) ? result.pages : [];

    return NextResponse.json({
      websiteUrl,
      hostname,
      blogs: blogs.map(({ url, title, description, wordCount, isDraft, contentHtml, plagiarism, plagiarismCheckedAt, plagiarismSources }) => ({
        url, title, description, wordCount,
        isDraft:              Boolean(isDraft),
        contentHtml:          typeof contentHtml === "string" ? contentHtml : "",
        plagiarism:           typeof plagiarism === "number" ? plagiarism : null,
        plagiarismCheckedAt:  plagiarismCheckedAt || null,
        plagiarismSources:    Array.isArray(plagiarismSources) ? plagiarismSources : [],
      })),
      pages: pages.map(({ url, title, description, wordCount, isDraft, contentHtml, plagiarism, plagiarismCheckedAt, plagiarismSources }) => ({
        url, title, description, wordCount,
        isDraft:              Boolean(isDraft),
        contentHtml:          typeof contentHtml === "string" ? contentHtml : "",
        plagiarism:           typeof plagiarism === "number" ? plagiarism : null,
        plagiarismCheckedAt:  plagiarismCheckedAt || null,
        plagiarismSources:    Array.isArray(plagiarismSources) ? plagiarismSources : [],
      })),
      source: {
        scanId:       scan.scanId,
        status:       result?.scan?.status || "complete",
        mode:         "published",
        fromCache:    false,
        allowSubdomains,
      },
    }, { status: 200 });

  } catch (e) {
    console.error("[opportunities] route error:", e?.message);
    return NextResponse.json(
      { error: e?.message || "Failed to build opportunities" },
      { status: 500 }
    );
  }
}
