// src/app/api/seo/geo/report/route.js
// ─────────────────────────────────────────────────────────────────────────────
// GEO Phase 3 — READ the collected GEO results for the report (items #8/#9/#10).
// Fetches from MongoDB only; shows REAL measured data when a run has completed, and
// the honest PLANNED state otherwise. Never invents SoV / citations / mentions.
//
//   GET /api/seo/geo/report?projectId=…[&answers=1]
//   → { ok, measured, geo_status, run, overall, by_engine, share_of_voice,
//       prompts_executed:[{prompt,engine,answer?,citation_count,source_domains,…}], citations, methodology }
// ─────────────────────────────────────────────────────────────────────────────
import { getGeoReportBundle } from "@/lib/seo/geo/model/geoStore";
import { buildGeoStatus } from "@/lib/seo/report-evidence";

export const runtime = "nodejs";
export const maxDuration = 30;

const GEO_METHODOLOGY = {
  collection: "Each approved neutral prompt is submitted into the real UI of every supported AI engine via Playwright / Browserless; the rendered answer + source links are captured.",
  engines: "ChatGPT, Google AI Overviews, Gemini, Claude, Copilot, Perplexity (login engines use captured sessions; no-login engines run logged-out).",
  context: "Fresh, history-free context per query (incognito-style); residential proxy for localized markets; heavy resources blocked to control cost.",
  parsing: "Brand + competitor mentions (count + first-appearance order) and citations (classified brand/competitor/third-party + order) extracted from the rendered answer.",
  scoring: "§21 weighted GEO model over the REAL results only (citation presence/position, brand presence, intent match, cross-engine consistency, freshness, topic coverage). DataForSEO/Moz/SERP are used for prompt context only — never for the GEO score.",
};

export async function GET(req) {
  const sp = new URL(req.url).searchParams;
  const projectId = sp.get("projectId");
  const withAnswers = sp.get("answers") === "1";
  if (!projectId) return Response.json({ ok: false, error: "projectId required" }, { status: 400 });

  try {
    const bundle = await getGeoReportBundle(projectId);
    const run = bundle.run;
    const collectionRun = !!run && ["completed", "partial"].includes(run.status);
    const geo_status = buildGeoStatus({
      geo: { prompt_count: run?.prompt_count || 0 },
      promptsReady: (run?.prompt_count || 0) > 0,
      collectionRun,
    });

    if (!collectionRun) {
      return Response.json({ ok: true, measured: false, geo_status, methodology: GEO_METHODOLOGY,
        run: run ? { run_id: run.run_id, status: run.status } : null });
    }

    const overall = bundle.metrics?.overall || {};
    const prompts_executed = (bundle.results || []).map((r) => ({
      prompt_id: r.prompt_id, prompt: r.raw_prompt, engine: r.engine,
      executed_at: r.created_at, version: r.version,
      brand_mention: (overall ? undefined : undefined), // mentions live in geo_mentions (per result)
      citation_count: r.citation_count || 0, source_domains: r.source_domains || [],
      answer_structure: r.answer_structure, parse_confidence: r.parse_confidence,
      ...(withAnswers ? { answer: String(r.rendered_text || "").slice(0, 4000) } : {}),
    }));

    return Response.json({
      ok: true, measured: true, geo_status, methodology: GEO_METHODOLOGY,
      run: { run_id: run.run_id, status: run.status, completed_at: run.completed_at, engines: run.engines || run.selected_engines, prompt_count: run.prompt_count, completed_count: run.completed_count },
      overall: { geo_score: overall.geo_score, sov: overall.sov, competitor_sov: overall.competitor_sov, mention_rate: overall.mention_rate, citation_rate: overall.citation_rate, engines_tested: overall.engines_tested },
      by_engine: bundle.metrics?.by_engine || [],
      share_of_voice: overall.share_of_voice || null,
      prompts_executed,
      citations: (bundle.citations || []).map((c) => ({ engine: c.engine, prompt_id: c.prompt_id, cited_domain: c.cited_domain, cited_url: c.cited_url, citation_order: c.citation_order, is_brand_domain: c.is_brand_domain, is_competitor_domain: c.is_competitor_domain })),
    });
  } catch (e) {
    return Response.json({ ok: false, error: String(e?.message || e).slice(0, 200) }, { status: 500 });
  }
}
