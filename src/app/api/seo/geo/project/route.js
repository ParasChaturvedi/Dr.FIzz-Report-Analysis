// src/app/api/seo/geo/project/route.js
// ─────────────────────────────────────────────────────────────────────────────
// GEO Phase 2 — create / fetch a geo_project (the container the prompts hang off).
//   POST /api/seo/geo/project   body: { projectId?, source|report, ...fields } → ensures + returns the project
//   GET  /api/seo/geo/project?projectId=…                                       → fetches one
// Planning/storage only — no engine execution, no Browserless.
// ─────────────────────────────────────────────────────────────────────────────
import { ensureGeoProject } from "@/lib/seo/geo/promptService";
import { getGeoProject } from "@/lib/seo/geo/model/geoStore";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req) {
  let body = {};
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "invalid JSON body" }, { status: 400 }); }
  try {
    const project = await ensureGeoProject(body);
    if (!project) return Response.json({ ok: false, error: "GEO store unavailable (MongoDB not reachable)" }, { status: 503 });
    return Response.json({ ok: true, project });
  } catch (e) {
    return Response.json({ ok: false, error: String(e?.message || e).slice(0, 200) }, { status: 500 });
  }
}

export async function GET(req) {
  const projectId = new URL(req.url).searchParams.get("projectId");
  if (!projectId) return Response.json({ ok: false, error: "projectId required" }, { status: 400 });
  try {
    const project = await getGeoProject(projectId);
    if (!project) return Response.json({ ok: false, error: "not found" }, { status: 404 });
    return Response.json({ ok: true, project });
  } catch (e) {
    return Response.json({ ok: false, error: String(e?.message || e).slice(0, 200) }, { status: 500 });
  }
}
