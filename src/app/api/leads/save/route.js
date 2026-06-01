import { NextResponse } from "next/server";

export const runtime = "nodejs";

// ─── Google Sheets webhook (Apps Script Web App URL) ─────────────────────────
// Set LEADS_SHEET_WEBHOOK in Vercel env vars → Project Settings → Environment Variables
// See instructions below for how to create this URL (one-time 5 min setup).
const SHEET_WEBHOOK = process.env.LEADS_SHEET_WEBHOOK || "";

// ─── Fire-and-forget POST to Google Sheets Apps Script ───────────────────────
async function sendToGoogleSheet(lead) {
  if (!SHEET_WEBHOOK) {
    console.warn("[ItzFizz Leads] LEADS_SHEET_WEBHOOK not set — skipping Google Sheets sync");
    return;
  }
  try {
    const res = await fetch(SHEET_WEBHOOK, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(lead),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[ItzFizz Leads] Google Sheets webhook error ${res.status}: ${text}`);
    } else {
      console.log(`[ItzFizz Leads] ✅ Lead synced to Google Sheets for ${lead.email}`);
    }
  } catch (err) {
    console.error("[ItzFizz Leads] Google Sheets fetch failed:", err?.message);
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { name, email, mobile, address, message, domain, reportUrl } = body;

    // Basic server-side validation
    if (!name?.trim() || !email?.trim() || !mobile?.trim()) {
      return NextResponse.json(
        { error: "name, email and mobile are required" },
        { status: 400 }
      );
    }

    const lead = {
      id:        `lead_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      name:      name.trim(),
      email:     email.trim(),
      mobile:    mobile.trim(),
      address:   address?.trim() || "",
      message:   message?.trim() || "",
      domain:    domain || "",
      reportUrl: reportUrl || "",
    };

    console.log(`[ItzFizz Leads] New lead: ${lead.name} <${lead.email}> | domain: ${lead.domain} | id: ${lead.id}`);

    // Send to Google Sheets (non-blocking — doesn't affect PDF download)
    sendToGoogleSheet(lead);

    return NextResponse.json({ success: true, id: lead.id });
  } catch (err) {
    console.error("[ItzFizz Leads] Save error:", err);
    return NextResponse.json({ error: "Failed to save lead" }, { status: 500 });
  }
}
