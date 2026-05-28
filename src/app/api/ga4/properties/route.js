import { NextResponse } from "next/server";
import { google } from "googleapis";
import { getAuthedGoogleClient } from "@/lib/googleClientFromCookie";

export const runtime = "nodejs";

export async function GET(req) {
  try {
    const auth = await getAuthedGoogleClient(req);

    // ✅ Correct Analytics Admin client
    const analyticsAdmin = google.analyticsadmin({
      version: "v1beta",
      auth,
    });

    const res = await analyticsAdmin.accountSummaries.list();

    const properties = [];

    for (const acct of res.data.accountSummaries || []) {
      for (const prop of acct.propertySummaries || []) {
        properties.push({
          propertyId: prop.property.replace("properties/", ""),
          displayName: prop.displayName,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      properties,
    });
  } catch (err) {
    console.error("GA4 properties error:", err);

    return NextResponse.json(
      {
        ok: false,
        error: err?.message || "Failed to fetch GA4 properties",
      },
      { status: 401 }
    );
  }
}
