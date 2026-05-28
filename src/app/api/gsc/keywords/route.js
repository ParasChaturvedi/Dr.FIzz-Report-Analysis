import { NextResponse } from "next/server";
import { google } from "googleapis";
import { getAuthedGoogleClient } from "@/lib/googleClientFromCookie";
import { readTokensFromRequest } from "@/lib/tokenStore";

export const runtime = "nodejs";

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function GET(req) {
  try {
    const saved = readTokensFromRequest(req);

    if (!saved?.gsc_site) {
      return NextResponse.json(
        { ok: false, error: "GSC site not selected" },
        { status: 400 }
      );
    }

    const auth = await getAuthedGoogleClient(req);

    const searchConsole = google.searchconsole({
      version: "v1",
      auth,
    });

    const rowLimit = 100; // MVP: top 100 queries by clicks

    const res = await searchConsole.searchanalytics.query({
      siteUrl: saved.gsc_site,
      requestBody: {
        startDate: "28daysAgo",
        endDate: "today",
        dimensions: ["query"],
        rowLimit,
        orderBy: [
          {
            field: "clicks",
            sortOrder: "DESCENDING",
          },
        ],
      },
    });

    const keywords =
      res.data.rows?.map((r) => ({
        keyword: r.keys?.[0] ?? "",
        clicks: toNum(r.clicks),
        impressions: toNum(r.impressions),
        ctr: toNum(r.ctr),
        position: toNum(r.position),
      })) || [];

    // Summary counts (based on avg position)
    const keywordsTotal = keywords.length;
    const top3 = keywords.filter((k) => k.position > 0 && k.position <= 3).length;
    const top10 = keywords.filter((k) => k.position > 0 && k.position <= 10).length;
    const top100 = keywords.filter((k) => k.position > 0 && k.position <= 100).length;

    return NextResponse.json({
      ok: true,
      site: saved.gsc_site,
      keywordsTotal,
      top3,
      top10,
      top100,
      keywords,
      debug: {
        range: "28daysAgo → today",
        rowLimit,
        note:
          "keywordsTotal/top3/top10/top100 are computed from the returned rows only (rowLimit capped).",
      },
    });
  } catch (err) {
    console.error("GSC keywords error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to fetch GSC keywords" },
      { status: 500 }
    );
  }
}
