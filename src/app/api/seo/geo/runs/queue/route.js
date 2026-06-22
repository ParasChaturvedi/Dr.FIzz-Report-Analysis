// src/app/api/seo/geo/runs/queue/route.js
// ─────────────────────────────────────────────────────────────────────────────
// GEO Phase 3 — QUEUE a run for the dedicated worker. Vercel NEVER runs the long
// browser job; it just flips a planned (draft) run to "queued" in MongoDB. The VPS
// worker (scripts/geo-worker.mjs) atomically claims queued runs and executes them
// through Playwright/Browserless, then writes results back.
//
//   POST /api/seo/geo/runs/queue
//   body: { runId }                       → queue that specific run
//   body: { projectId }                   → queue the project's latest draft run
//   → { ok, run_id, status:"queued" }
//
// Guarded by GEO_ADMIN_SECRET in prod (queuing a run incurs real collection cost).
// ─────────────────────────────────────────────────────────────────────────────
import { getGeoRun, updateGeoRun, getLatestRun } from "@/lib/seo/geo/model/geoStore";

export const runtime = "nodejs";
export const maxDuration = 30;

function authed(req) {
  const secret = String(process.env.GEO_ADMIN_SECRET || "");
  if (!secret) return true; // dev (no secret) → open; prod sets the secret
  return (req.headers.get("x-geo-admin-secret") || "") === secret;
}

export async function POST(req) {
  if (!authed(req)) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  let body = {};
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "invalid JSON body" }, { status: 400 }); }

  try {
    let run = null;
    if (body.runId) run = await getGeoRun(body.runId);
    else if (body.projectId) run = await getLatestRun(body.projectId);
    if (!run) return Response.json({ ok: false, error: "run not found (pass runId or projectId)" }, { status: 404 });

    if (["running", "queued"].includes(run.status)) {
      return Response.json({ ok: true, run_id: run.run_id, status: run.status, note: "already queued/running" });
    }
    if (["completed", "partial"].includes(run.status)) {
      return Response.json({ ok: false, error: `run already ${run.status}; regenerate prompts for a fresh run`, run_id: run.run_id, status: run.status }, { status: 409 });
    }
    await updateGeoRun(run.run_id, { status: "queued", queued_at: new Date().toISOString(), stopped_by_user: false });
    return Response.json({ ok: true, run_id: run.run_id, status: "queued", message: "Run queued. The GEO worker will pick it up and collect real AI-engine answers." });
  } catch (e) {
    return Response.json({ ok: false, error: String(e?.message || e).slice(0, 200) }, { status: 500 });
  }
}
