// src/app/api/seo/geo/prompts/regenerate/route.js
// ─────────────────────────────────────────────────────────────────────────────
// GEO Phase 2 — REGENERATE prompts (wipe the project's prompts, then re-plan + store).
//   POST /api/seo/geo/prompts/regenerate   body: same as /generate (projectId required)
// Planning only — no engine execution, no Browserless. Same GEO_ADMIN_SECRET guard.
// ─────────────────────────────────────────────────────────────────────────────
import { regenerateGeoPrompts } from "@/lib/seo/geo/promptService";

export const runtime = "nodejs";
export const maxDuration = 300;

function authed(req) {
  const secret = String(process.env.GEO_ADMIN_SECRET || "");
  if (!secret) return true; // dev (no secret) → open; prod sets the secret
  return (req.headers.get("x-geo-admin-secret") || "") === secret;
}

export async function POST(req) {
  if (!authed(req)) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  let body = {};
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "invalid JSON body" }, { status: 400 }); }
  if (!body.projectId) return Response.json({ ok: false, error: "projectId required" }, { status: 400 });
  try {
    const result = await regenerateGeoPrompts(body);
    const status = result.ok ? 200 : (String(result.error || "").includes("unavailable") ? 503 : 400);
    return Response.json(result, { status });
  } catch (e) {
    return Response.json({ ok: false, error: String(e?.message || e).slice(0, 200) }, { status: 500 });
  }
}
