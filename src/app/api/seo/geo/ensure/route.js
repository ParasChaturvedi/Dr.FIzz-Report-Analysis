// src/app/api/seo/geo/ensure/route.js
// ─────────────────────────────────────────────────────────────────────────────
// GEO AUTO-COLLECTION TRIGGER (idempotent). The report calls this for its domain so
// GEO collection starts AUTOMATICALLY — no manual step, no "planned" dead-end. Vercel
// only QUEUES (never runs the browser); the worker collects.
//
//   POST /api/seo/geo/ensure   body: { domain, source? }
//   → { ok, status, run_id, project_id, prompts?, engines?, note? }
//
// COST-SAFE (idempotency = the cost guard): if a run is already queued/running, or a
// completed run exists within the 30-day cache window, it returns that — it does NOT
// re-queue. Only a missing or >30-day-stale collection generates + queues a fresh run.
// So a domain costs at most one collection per 30 days, no matter how many report views.
// Prompts are generated token-free (useClaude:false). No GEO data is faked.
// ─────────────────────────────────────────────────────────────────────────────
import { generateGeoPromptsForProject } from "@/lib/seo/geo/promptService";
import { getGeoProjectByDomain, getLatestRun, setPromptsStatus, updateGeoRun } from "@/lib/seo/geo/model/geoStore";

export const runtime = "nodejs";
export const maxDuration = 60;

const REFRESH_DAYS = Number(process.env.GEO_CACHE_REFRESH_DAYS || 30);
const cleanDomain = (s) => String(s || "").trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/.*$/, "").toLowerCase();

export async function POST(req) {
  let body = {};
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "invalid JSON body" }, { status: 400 }); }
  const domain = cleanDomain(body.domain || body.source?.domain);
  if (!domain) return Response.json({ ok: false, error: "domain required" }, { status: 400 });

  try {
    // ── idempotency + 30-day cache (the cost guard) ──
    const project = await getGeoProjectByDomain(domain);
    if (project) {
      const run = await getLatestRun(project.project_id);
      if (run) {
        if (["queued", "running", "collecting", "parsing", "scoring"].includes(run.status)) {
          return Response.json({ ok: true, status: run.status, run_id: run.run_id, project_id: project.project_id, note: "collection already in progress" });
        }
        if (["completed", "partial"].includes(run.status)) {
          const ageDays = (Date.now() - new Date(run.completed_at || run.created_at).getTime()) / 86400000;
          if (ageDays < REFRESH_DAYS) {
            return Response.json({ ok: true, status: "complete", run_id: run.run_id, project_id: project.project_id, cached: true, age_days: Math.round(ageDays), note: `cached result (${Math.round(ageDays)}d old, refreshes after ${REFRESH_DAYS}d)` });
          }
          // else: stale → fall through to a fresh collection
        }
        if (run.status === "session_required") {
          return Response.json({ ok: true, status: "session_required", run_id: run.run_id, project_id: project.project_id, note: "engines need login sessions" });
        }
      }
    }

    // ── generate (token-free) + auto-approve + queue a fresh run ──
    const source = body.source && typeof body.source === "object" ? { ...body.source, domain } : { domain };
    const planMode = (Array.isArray(source.keywords) && source.keywords.length) || (Array.isArray(source.competitors) && source.competitors.length) ? "full" : "quick";
    const gen = await generateGeoPromptsForProject({
      projectId: project?.project_id, source,
      runMode: body.runMode || "standard",
      geoPlanMode: planMode,
      useClaude: false,          // token-free template generation
      regenerate: true,          // fresh prompt set for this collection
    });
    if (!gen.ok) return Response.json({ ok: false, error: gen.error || "could not generate prompts" }, { status: 503 });

    await setPromptsStatus(gen.project_id, [], "approved");   // auto-approve all
    await updateGeoRun(gen.run_id, { status: "queued", queued_at: new Date().toISOString(), approved_prompt_count: gen.generated, stopped_by_user: false });

    return Response.json({ ok: true, status: "queued", run_id: gen.run_id, project_id: gen.project_id, prompts: gen.generated, engines: gen.selected_engines, message: "GEO collection queued — the worker will collect real AI-engine answers." });
  } catch (e) {
    return Response.json({ ok: false, error: String(e?.message || e).slice(0, 200) }, { status: 500 });
  }
}
