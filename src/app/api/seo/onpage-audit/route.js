// src/app/api/seo/onpage-audit/route.js
import { NextResponse } from "next/server";
import { fetchOnPageAudit } from "@/lib/seo/dataforseo";

export const runtime = "nodejs";
// Allow up to 60 seconds for this slow audit
export const maxDuration = 60;

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { domain } = body || {};

    if (!domain) {
      return NextResponse.json({ error: "Missing domain" }, { status: 400 });
    }

    const cleanDomain = String(domain).trim()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split("/")[0];

    if (!cleanDomain) {
      return NextResponse.json({ error: "Invalid domain" }, { status: 400 });
    }

    const audit = await fetchOnPageAudit(cleanDomain);

    return NextResponse.json({ ok: true, onPageAudit: audit });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err?.message || "Audit failed" }, { status: 500 });
  }
}
