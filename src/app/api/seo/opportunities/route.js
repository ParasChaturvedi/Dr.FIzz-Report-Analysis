// src/app/api/seo/opportunities/route.js
import { NextResponse } from "next/server";
import { normalizeToHttps, getHostname } from "@/lib/seo/discovery";
import { getLatestOpportunities } from "@/lib/seo/snapshots.store";
import { enqueueOpportunitiesScan } from "@/lib/seo/jobs/scan-opportunities";

export const runtime = "nodejs";

const TTL_MS = 24 * 60 * 60 * 1000; // 24h

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const websiteUrl = normalizeToHttps(body?.websiteUrl);
    const allowSubdomains =
      body?.allowSubdomains == null ? true : Boolean(body.allowSubdomains);

    if (!websiteUrl) {
      return NextResponse.json({ error: "websiteUrl is required" }, { status: 400 });
    }

    const hostname = getHostname(websiteUrl);
    if (!hostname) {
      return NextResponse.json({ error: "Invalid websiteUrl" }, { status: 400 });
    }

    // 1) SnapshotStore first (published only)
    // IMPORTANT: pass hostname (NOT a custom cacheKey); the store already keys by hostname + allowSubdomains + mode.
    const cached = getLatestOpportunities(hostname, {
      ttlMs: TTL_MS,
      mode: "published",
      allowSubdomains,
    });

    if (cached) {
      const blogs = Array.isArray(cached.blogs) ? cached.blogs : [];
      const pages = Array.isArray(cached.pages) ? cached.pages : [];

      // ✅ If a scan is still running, return 202 so UI can poll instead of re-enqueueing
      const scanStatus = cached.scan?.status;
      const isInProgress =
        scanStatus === "queued" ||
        scanStatus === "running" ||
        scanStatus === "pending";

      const payload = {
        websiteUrl,
        hostname,
        blogs: blogs.map(
          ({
            url,
            title,
            description,
            wordCount,
            isDraft,
            contentHtml,
            plagiarism,
            plagiarismCheckedAt,
            plagiarismSources,
          }) => ({
            url,
            title,
            description,
            wordCount,
            isDraft: Boolean(isDraft),
            // ✅ pass through pre-sanitized html if scan stored it
            contentHtml: typeof contentHtml === "string" ? contentHtml : "",
            // ✅ plagiarism fields (precomputed during scan)
            plagiarism: typeof plagiarism === "number" ? plagiarism : null,
            plagiarismCheckedAt: plagiarismCheckedAt || null,
            plagiarismSources: Array.isArray(plagiarismSources) ? plagiarismSources : [],
          })
        ),
        pages: pages.map(
          ({
            url,
            title,
            description,
            wordCount,
            isDraft,
            contentHtml,
            plagiarism,
            plagiarismCheckedAt,
            plagiarismSources,
          }) => ({
            url,
            title,
            description,
            wordCount,
            isDraft: Boolean(isDraft),
            // ✅ pass through pre-sanitized html if scan stored it
            contentHtml: typeof contentHtml === "string" ? contentHtml : "",
            // ✅ plagiarism fields (precomputed during scan)
            plagiarism: typeof plagiarism === "number" ? plagiarism : null,
            plagiarismCheckedAt: plagiarismCheckedAt || null,
            plagiarismSources: Array.isArray(plagiarismSources) ? plagiarismSources : [],
          })
        ),
        source: {
          scanId: cached.scan?.scanId,
          status: cached.scan?.status,
          mode: cached.scan?.mode || "published",
          provider: cached.scan?.provider || null,
          diagnostics: cached.scan?.diagnostics || {},
          fromCache: true,
          allowSubdomains,
        },
      };

      return NextResponse.json(payload, { status: isInProgress ? 202 : 200 });
    }

    // 2) Need scan → enqueue + return 202
    const scan = await enqueueOpportunitiesScan({
      websiteUrl,
      allowSubdomains,
    });

    return NextResponse.json(
      {
        websiteUrl,
        hostname,
        blogs: [],
        pages: [],
        source: {
          scanId: scan?.scanId || null,
          status: scan?.status || "queued",
          fromCache: false,
          mode: "published",
          allowSubdomains,
        },
      },
      { status: 202 }
    );
  } catch (e) {
    return NextResponse.json(
      { error: e?.message || "Failed to build opportunities" },
      { status: 500 }
    );
  }
}
