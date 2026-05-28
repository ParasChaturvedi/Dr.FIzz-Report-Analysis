import { NextResponse } from "next/server";
import { google } from "googleapis";
import { getAuthedGoogleClient } from "@/lib/googleClientFromCookie";

export const runtime = "nodejs";

export async function GET(req) {
  try {
    const auth = await getAuthedGoogleClient(req);

    const searchConsole = google.searchconsole({
      version: "v1",
      auth,
    });

    const res = await searchConsole.sites.list();

    // Return everything first (no filtering) to debug permissions
    const sites = (res.data.siteEntry || []).map(s => ({
      siteUrl: s.siteUrl,
      permissionLevel: s.permissionLevel,
    }));

    return NextResponse.json({
      ok: true,
      sites,
    });
  } catch (err) {
    console.error("GSC sites error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to list GSC sites" },
      { status: 401 }
    );
  }
}
