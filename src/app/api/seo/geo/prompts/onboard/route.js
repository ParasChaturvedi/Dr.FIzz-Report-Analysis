// src/app/api/seo/geo/prompts/onboard/route.js
// ─────────────────────────────────────────────────────────────────────────────
// ONBOARDING GEO-PROMPT STEP (step 5). Two actions, server-side only (no GEO_ADMIN_SECRET
// exposed to the browser — this route calls the internal generator/store directly and NEVER
// runs an AI engine / Browserless):
//   • default  { domain, source }                → author ~30 neutral candidate prompts + a DRAFT
//                                                   run, returns them for the selection UI.
//   • finalize { projectId, runId, selectedPromptIds, customPrompts }
//                                                → approve ONLY the selected prompts (+ store the
//                                                  user's custom "Others"). Unselected stay
//                                                  "pending" → dashboard-only, never scanned. The
//                                                  scan is queued later by /api/seo/geo/ensure.
// ─────────────────────────────────────────────────────────────────────────────
import { generateGeoPromptsForProject } from "@/lib/seo/geo/promptService";
import { saveGeoPrompts, setPromptsStatus } from "@/lib/seo/geo/model/geoStore";

export const runtime = "nodejs";
// prompt authoring runs the seo-geo-prompt-set-architect skill via Claude (large pinned bundle)
export const maxDuration = 300;

const cleanDomain = (s) => String(s || "").trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/.*$/, "").toLowerCase();

export async function POST(req) {
  let body = {};
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "invalid JSON body" }, { status: 400 }); }

  // ── FINALIZE — persist the user's selection ──
  if (body.action === "finalize") {
    const projectId = body.projectId;
    if (!projectId) return Response.json({ ok: false, error: "projectId required" }, { status: 400 });
    try {
      const selected = Array.isArray(body.selectedPromptIds) ? body.selectedPromptIds.filter(Boolean) : [];
      // custom "Others" prompts the user typed — stored as approved so they run in the scan too
      const custom = (Array.isArray(body.customPrompts) ? body.customPrompts : [])
        .map((t) => String(t || "").trim())
        .filter((t) => t.length >= 6)
        .map((t) => ({ prompt_text: t, cluster: "Custom", intent: "informational", neutral: true, status: "approved", geo_run_id: body.runId || null }));
      let customSaved = 0;
      if (custom.length) {
        const s = await saveGeoPrompts(projectId, custom, { geo_run_id: body.runId || null });
        customSaved = Array.isArray(s) ? s.length : custom.length;
      }
      // Approve ONLY the selected generated prompts. Unselected keep their "pending" status, so the
      // worker (which runs status:"approved" only) never scans them — they remain for the dashboard.
      if (selected.length) await setPromptsStatus(projectId, selected, "approved");
      return Response.json({ ok: true, approved: selected.length, custom: customSaved });
    } catch (e) {
      return Response.json({ ok: false, error: String(e?.message || e).slice(0, 200) }, { status: 500 });
    }
  }

  // ── GENERATE — author the neutral candidate set for the selection UI ──
  const domain = cleanDomain(body.domain || body.source?.domain);
  if (!domain) return Response.json({ ok: false, error: "domain required" }, { status: 400 });
  try {
    const source = body.source && typeof body.source === "object" ? { ...body.source, domain } : { domain };
    const planMode = (Array.isArray(source.keywords) && source.keywords.length) ? "full" : "quick";
    const gen = await generateGeoPromptsForProject({
      source,
      runMode: "fast",           // ~24-30 neutral prompts (RUN_MODE_PRESETS.fast)
      geoPlanMode: planMode,
      useClaude: true,           // author via the seo-geo-prompt-set-architect skill
      regenerate: true,          // a fresh candidate set for this project
    });
    if (!gen.ok) return Response.json({ ok: false, error: gen.error || "could not generate prompts" }, { status: 503 });
    const prompts = (gen.preview?.prompts || []).map((p) => ({
      prompt_id:     p.prompt_id,
      prompt_text:   p.prompt_text || p.prompt || "",
      cluster:       p.cluster || "GEO",
      intent:        p.intent || "informational",
      priority:      Number(p.priority) || 999,
      quality_score: Number(p.quality_score) || 0,
    })).filter((p) => p.prompt_id && p.prompt_text);
    return Response.json({ ok: true, project_id: gen.project_id, run_id: gen.run_id, prompts });
  } catch (e) {
    return Response.json({ ok: false, error: String(e?.message || e).slice(0, 200) }, { status: 500 });
  }
}
