import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

// ─── Where leads are persisted ────────────────────────────────────────────────
// Primary:  <project-root>/leads.json  (local dev — survives server restarts)
// Fallback: /tmp/leads.json            (Vercel / any read-only FS environment)
const PRIMARY_PATH  = path.join(process.cwd(), "leads.json");
const FALLBACK_PATH = "/tmp/leads.json";

function resolveLeadsPath() {
  try {
    // Check if the project root is writable
    fs.accessSync(process.cwd(), fs.constants.W_OK);
    return PRIMARY_PATH;
  } catch {
    return FALLBACK_PATH;
  }
}

function readLeads(filePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeLeads(filePath, leads) {
  fs.writeFileSync(filePath, JSON.stringify(leads, null, 2), "utf-8");
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
      id: `lead_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      name:      name.trim(),
      email:     email.trim(),
      mobile:    mobile.trim(),
      address:   address?.trim() || "",
      message:   message?.trim() || "",
      domain:    domain || "",
      reportUrl: reportUrl || "",
    };

    const filePath = resolveLeadsPath();
    const existing = readLeads(filePath);
    existing.push(lead);
    writeLeads(filePath, existing);

    console.log(`[ItzFizz Leads] Saved lead #${existing.length} for ${email} → ${filePath}`);

    return NextResponse.json({ success: true, id: lead.id, savedTo: filePath });
  } catch (err) {
    console.error("[ItzFizz Leads] Save error:", err);
    return NextResponse.json({ error: "Failed to save lead" }, { status: 500 });
  }
}
