// src/app/api/seo/geo/prompts/approve/route.js
// ─────────────────────────────────────────────────────────────────────────────
// GEO Phase 2 — APPROVE / REJECT / EDIT prompts before Phase-3 execution.
//   POST /api/seo/geo/prompts/approve
//   • bulk approve/reject:  { projectId, promptIds?:[], status:"approved"|"rejected" }
//                           (omit promptIds to apply to ALL prompts in the project)
//   • edit one prompt:      { action:"edit", promptId, prompt_text?, cluster?, intent?, expected_answer_type? }
// No engine execution. Approved prompts are what the Phase-3 worker will pick up.
// ─────────────────────────────────────────────────────────────────────────────
import { setPromptApproval, editGeoPrompt } from "@/lib/seo/geo/promptService";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req) {
  let body = {};
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "invalid JSON body" }, { status: 400 }); }
  try {
    const isEdit = body.action === "edit" || (body.promptId && (body.prompt_text != null || body.cluster || body.intent || body.expected_answer_type));
    if (isEdit) {
      const r = await editGeoPrompt(body);
      return Response.json(r, { status: r.ok ? 200 : 400 });
    }
    const r = await setPromptApproval({
      projectId: body.projectId,
      promptIds: body.promptIds || body.prompt_ids || [],
      status: body.status || "approved",
    });
    return Response.json(r, { status: r.ok ? 200 : 400 });
  } catch (e) {
    return Response.json({ ok: false, error: String(e?.message || e).slice(0, 200) }, { status: 500 });
  }
}
