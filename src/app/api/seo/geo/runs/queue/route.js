// src/app/api/seo/geo/runs/queue/route.js
// ─────────────────────────────────────────────────────────────────────────────
// GEO Phase 3 — QUEUE a run for the dedicated worker (item #3). Vercel NEVER runs the
// browser job; it only flips a planned (draft) run to "queued" in MongoDB after the
// pre-queue SAFETY CHECKS pass. The VPS worker then atomically claims queued runs.
//
//   POST /api/seo/geo/runs/queue
//   body: { runId } | { projectId }   → { ok, run_id, status:"queued", approved_prompts, engines }
//
// Safety checks (#3): prompts exist · prompts approved · selected engines valid · run
// mode set · no duplicate active (queued/running) run. Guarded by GEO_ADMIN_SECRET in
// prod (queuing a run is what authorizes real, paid collection — cost protection #7).
// ─────────────────────────────────────────────────────────────────────────────
import { getGeoRun, updateGeoRun, getLatestRun, getGeoPrompts, listRuns } from "@/lib/seo/geo/model/geoStore";
import { GEO_ENGINES, RUN_MODES } from "@/lib/seo/geo/model/constants";

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
    let run = body.runId ? await getGeoRun(body.runId) : (body.projectId ? await getLatestRun(body.projectId) : null);
    if (!run) return Response.json({ ok: false, error: "run not found (pass runId or projectId)" }, { status: 404 });
    const projectId = run.geo_project_id;

    if (["queued", "running"].includes(run.status)) {
      return Response.json({ ok: true, run_id: run.run_id, status: run.status, note: "already queued/running" });
    }
    if (["completed", "partial"].includes(run.status)) {
      return Response.json({ ok: false, error: `run already ${run.status}; regenerate prompts for a fresh run`, run_id: run.run_id, status: run.status }, { status: 409 });
    }

    // ── pre-queue SAFETY CHECKS (#3) ──
    const [allPrompts, approved, recentRuns] = await Promise.all([
      getGeoPrompts(projectId),
      getGeoPrompts(projectId, { status: "approved" }),
      listRuns(projectId, 25),
    ]);
    const engines = run.selected_engines?.length ? run.selected_engines : (run.engines || []);
    const checks = {
      prompts_exist: allPrompts.length > 0,
      prompts_approved: approved.length > 0,
      engines_selected: engines.length > 0 && engines.every((e) => GEO_ENGINES.includes(e)),
      run_mode_set: !!run.run_mode && RUN_MODES.includes(run.run_mode),
      no_duplicate_active: !recentRuns.some((r) => r.run_id !== run.run_id && ["queued", "running"].includes(r.status)),
    };
    const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([k]) => k);
    if (failed.length) {
      const hints = {
        prompts_exist: "generate prompts first (/api/seo/geo/prompts/generate)",
        prompts_approved: "approve prompts first (/api/seo/geo/prompts/approve)",
        engines_selected: "the run has no valid selected engines",
        run_mode_set: "the run has no run_mode",
        no_duplicate_active: "another run is already queued/running for this project",
      };
      return Response.json({ ok: false, error: "pre-queue safety checks failed", failed_checks: failed, checks, hint: hints[failed[0]] }, { status: 400 });
    }

    await updateGeoRun(run.run_id, { status: "queued", queued_at: new Date().toISOString(), approved_prompt_count: approved.length, stopped_by_user: false });
    return Response.json({ ok: true, run_id: run.run_id, status: "queued", approved_prompts: approved.length, engines, message: "Run queued. The GEO worker will collect real AI-engine answers and write them back to MongoDB." });
  } catch (e) {
    return Response.json({ ok: false, error: String(e?.message || e).slice(0, 200) }, { status: 500 });
  }
}
