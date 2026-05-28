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

    if (!saved?.ga4_property_id) {
      return NextResponse.json(
        { ok: false, error: "GA4 property not selected" },
        { status: 400 }
      );
    }

    const auth = await getAuthedGoogleClient(req);

    const analyticsData = google.analyticsdata({
      version: "v1beta",
      auth,
    });

    const property = `properties/${saved.ga4_property_id}`;

    // 1) Organic sessions + conversions (your main desired report)
    const organicRes = await analyticsData.properties.runReport({
      property,
      requestBody: {
        dateRanges: [{ startDate: "28daysAgo", endDate: "today" }],
        metrics: [{ name: "sessions" }, { name: "conversions" }],
        dimensions: [{ name: "sessionDefaultChannelGroup" }],
        dimensionFilter: {
          filter: {
            fieldName: "sessionDefaultChannelGroup",
            stringFilter: { value: "Organic Search" },
          },
        },
      },
    });

    const organicRow = organicRes.data.rows?.[0];
    const organicSessions = toNum(organicRow?.metricValues?.[0]?.value);
    const organicConversions = toNum(organicRow?.metricValues?.[1]?.value);

    // 2) Total sessions (debug / sanity check: does this property have any data?)
    const totalRes = await analyticsData.properties.runReport({
      property,
      requestBody: {
        dateRanges: [{ startDate: "28daysAgo", endDate: "today" }],
        metrics: [{ name: "sessions" }],
      },
    });

    const totalRow = totalRes.data.rows?.[0];
    const totalSessions = toNum(totalRow?.metricValues?.[0]?.value);

    // Helpful metadata
    const organicRowCount = organicRes.data.rowCount ?? organicRes.data.rows?.length ?? 0;

    return NextResponse.json({
      ok: true,
      propertyId: saved.ga4_property_id,
      organicTraffic: organicSessions,
      leads: organicConversions,
      debug: {
        totalSessionsLast28d: totalSessions,
        organicRowCount,
        note:
          totalSessions === 0
            ? "This GA4 property appears to have no data in the last 28 days."
            : organicSessions === 0
            ? "Property has data, but no 'Organic Search' sessions in last 28 days (or channel grouping differs)."
            : organicConversions === 0
            ? "Property has organic sessions, but conversions/leads are 0 (likely no conversions configured)."
            : "Looks good.",
      },
    });
  } catch (err) {
    console.error("GA4 report error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "GA4 report failed" },
      { status: 500 }
    );
  }
}
