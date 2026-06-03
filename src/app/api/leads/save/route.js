import { NextResponse } from "next/server";
import { appendFile, mkdir } from "fs/promises";
import { join } from "path";

export const runtime = "nodejs";

// ─── Lead destinations ────────────────────────────────────────────────────────
// 1. Google Sheets Apps Script webhook (set LEADS_SHEET_WEBHOOK) — survives on Vercel
// 2. Generic webhook (set LEADS_WEBHOOK_URL) — e.g. Zapier/Make/n8n/Slack
// 3. File append (local dev → ./leads.json, serverless → /tmp/leads.json)
// 4. Structured console log (always) — recoverable from Vercel runtime logs
const SHEET_WEBHOOK   = process.env.LEADS_SHEET_WEBHOOK || "";
const GENERIC_WEBHOOK = process.env.LEADS_WEBHOOK_URL  || "";

function isServerless() {
  return !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

async function postWebhook(url, lead) {
  try {
    const res = await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(lead),
      signal:  AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error(`[ItzFizz Leads] webhook ${url.slice(0, 40)}… → ${res.status}: ${(await res.text().catch(() => "")).slice(0, 120)}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[ItzFizz Leads] webhook failed:", err?.message);
    return false;
  }
}

async function appendToFile(lead) {
  try {
    const dir  = isServerless() ? "/tmp" : process.cwd();
    const file = join(dir, "leads.json");
    if (isServerless()) { try { await mkdir("/tmp", { recursive: true }); } catch {} }
    // JSON-Lines: one lead per line — easy to append and to parse later.
    await appendFile(file, JSON.stringify(lead) + "\n", "utf8");
    return true;
  } catch (err) {
    console.error("[ItzFizz Leads] file append failed:", err?.message);
    return false;
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { name, email, mobile, address, message, domain, reportUrl } = body || {};

    // Server-side validation
    if (!name?.trim() || !email?.trim() || !mobile?.trim()) {
      return NextResponse.json(
        { error: "name, email and mobile are required", success: false },
        { status: 400 }
      );
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      return NextResponse.json({ error: "invalid email", success: false }, { status: 400 });
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

    // 4. ALWAYS log a structured, greppable line so no lead is ever lost — even
    //    with zero destinations configured, this is recoverable from logs.
    console.log("[ItzFizz Leads] LEAD_CAPTURE " + JSON.stringify(lead));

    // Fan out to every configured destination (in parallel, best-effort).
    const [fileOk, sheetOk, webhookOk] = await Promise.all([
      appendToFile(lead),
      SHEET_WEBHOOK   ? postWebhook(SHEET_WEBHOOK, lead)   : Promise.resolve(null),
      GENERIC_WEBHOOK ? postWebhook(GENERIC_WEBHOOK, lead) : Promise.resolve(null),
    ]);

    const persisted = {
      file:    fileOk,
      sheet:   sheetOk,
      webhook: webhookOk,
      log:     true,
    };
    const anyDurable = sheetOk === true || webhookOk === true;
    if (!anyDurable && !SHEET_WEBHOOK && !GENERIC_WEBHOOK) {
      console.warn("[ItzFizz Leads] No durable destination configured (set LEADS_SHEET_WEBHOOK or LEADS_WEBHOOK_URL). Lead saved to file + logs only.");
    }

    return NextResponse.json({ success: true, id: lead.id, persisted });
  } catch (err) {
    console.error("[ItzFizz Leads] Save error:", err);
    return NextResponse.json({ error: "Failed to save lead", success: false }, { status: 500 });
  }
}
