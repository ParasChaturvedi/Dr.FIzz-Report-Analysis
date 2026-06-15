// src/app/api/report/cached/route.js
// Fast "is a fresh (≤30-day) report already cached for this exact request?" check.
// Lets Step 5 SHORT-CIRCUIT the whole collect→analyse→generate pipeline and show the
// saved report instantly — no DataForSEO, no Moz, no Claude, no slow request.
// Returns { found:true, id, reportType, data } on a hit, else { found:false }.
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getCached } from "@/lib/cache/mongo";
import { reportCacheType } from "@/lib/cache/report-key";

export const runtime = "nodejs";
export const maxDuration = 20;

function ensureHttpUrl(input) {
  const raw = String(input || "").trim();
  if (!raw) return null;
  return raw.includes("://") ? raw : `https://${raw}`;
}
function getDomain(url) {
  try { return new URL(ensureHttpUrl(url)).hostname.replace(/^www\./, ""); }
  catch { return String(url || "").replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]; }
}
function isPageUrl(url) {
  try { const u = new URL(ensureHttpUrl(url)); return !!(u.pathname && u.pathname !== "/" && u.pathname !== ""); }
  catch { return false; }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { url, businessData, competitorData, reportMode, keyword, countryCode = "in" } = body || {};
    if (!url) return NextResponse.json({ found: false });
    const domain = getDomain(url);
    const reportType = isPageUrl(url) ? "page" : "website";
    const dataType = reportCacheType({ reportType, businessData, competitorData, reportMode, keyword, countryCode });
    const data = await getCached({ domain, dataType, ttlDays: 30 });
    if (data) {
      console.log(`[report/cached] HIT ${domain} (${dataType}) — serving saved report, pipeline skipped`);
      return NextResponse.json({ found: true, id: randomUUID(), reportType, data });
    }
    return NextResponse.json({ found: false });
  } catch (e) {
    console.warn("[report/cached] check failed (will run pipeline):", e?.message);
    return NextResponse.json({ found: false, error: e?.message });
  }
}
