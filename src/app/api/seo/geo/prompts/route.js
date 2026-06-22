// src/app/api/seo/geo/prompts/route.js
// ─────────────────────────────────────────────────────────────────────────────
// GEO Phase 2 — FETCH the prompt preview for a project (read-only).
//   GET /api/seo/geo/prompts?projectId=…&status=…&limit=…
//   → { project, run, run_mode, selected_engines, counts:{total,by_cluster,by_intent,by_status},
//       estimate:{prompt_count,selected_engines,estimated_engine_runs,run_mode,
//                 validation_sample_size,estimated_cost_level,estimated_cost_usd},
//       prompts:[{prompt_id,prompt_text,cluster,intent,source_keywords,priority,
//                 expected_answer_type,neutral,quality_score,selected_engines,status,location_context}] }
// ─────────────────────────────────────────────────────────────────────────────
import { getPromptPreview } from "@/lib/seo/geo/promptService";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req) {
  const sp = new URL(req.url).searchParams;
  const projectId = sp.get("projectId");
  if (!projectId) return Response.json({ ok: false, error: "projectId required" }, { status: 400 });
  const limit = Number(sp.get("limit")) || 0;
  const status = sp.get("status") || undefined;
  try {
    const result = await getPromptPreview(projectId, { limit, status });
    return Response.json(result, { status: result.ok ? 200 : 404 });
  } catch (e) {
    return Response.json({ ok: false, error: String(e?.message || e).slice(0, 200) }, { status: 500 });
  }
}
