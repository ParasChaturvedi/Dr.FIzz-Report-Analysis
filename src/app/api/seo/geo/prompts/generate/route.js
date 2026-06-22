// src/app/api/seo/geo/prompts/generate/route.js
// ─────────────────────────────────────────────────────────────────────────────
// GEO Phase 2 — GENERATE + STORE prompts for a project (planning only).
//   POST /api/seo/geo/prompts/generate
//   body: { projectId?, source|report, runMode? ("smoke"|"standard"|"full"),
//           selectedEngines?, promptLimit?, useClaude?, regenerate? }
//   → plans a balanced 14-cluster prompt set sized to the run mode, stores every
//     prompt + a DRAFT planned run via geoStore, returns the dashboard preview.
//
// Does NOT execute prompts in any AI engine and NEVER triggers Browserless. The only
// external call is cheap one-time Claude text generation (skip with useClaude:false).
//
// Guarded by GEO_ADMIN_SECRET when that env is set (prod); open in local dev when it
// is not, so the costly-ish generation endpoint is protected in production.
// ─────────────────────────────────────────────────────────────────────────────
import { generateGeoPromptsForProject } from "@/lib/seo/geo/promptService";

export const runtime = "nodejs";
export const maxDuration = 300;

function authed(req) {
  const secret = String(process.env.GEO_ADMIN_SECRET || "");
  if (!secret) return true; // no secret configured (dev) → open; prod sets the secret
  return (req.headers.get("x-geo-admin-secret") || "") === secret;
}

export async function POST(req) {
  if (!authed(req)) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  let body = {};
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "invalid JSON body" }, { status: 400 }); }
  try {
    const result = await generateGeoPromptsForProject(body);
    const status = result.ok ? 200 : (String(result.error || "").includes("unavailable") ? 503 : 400);
    return Response.json(result, { status });
  } catch (e) {
    return Response.json({ ok: false, error: String(e?.message || e).slice(0, 200) }, { status: 500 });
  }
}
