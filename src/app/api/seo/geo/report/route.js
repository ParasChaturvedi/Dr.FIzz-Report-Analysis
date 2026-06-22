// src/app/api/seo/geo/report/route.js
// ─────────────────────────────────────────────────────────────────────────────
// GEO Phase 3 — READ the collected GEO results for the report (items #6/#8/#9/#10).
// Fetches from MongoDB only; shows REAL measured data ONLY for complete/partial runs,
// and the honest state (planned/queued/running/session_required/failed) otherwise.
// Surfaces the live per-engine adapter status so the report can show which engines are
// ready vs session_required. Never invents SoV / citations / mentions.
//
//   GET /api/seo/geo/report?projectId=…[&answers=1]
// ─────────────────────────────────────────────────────────────────────────────
import { getGeoReportBundle, getGeoProjectByDomain } from "@/lib/seo/geo/model/geoStore";
import { buildGeoStatus } from "@/lib/seo/report-evidence";
import { getEngineAdapters } from "@/lib/seo/geo/engineAdapters";
import { resolveExecutionProvider } from "@/lib/seo/geo/executionProvider";

export const runtime = "nodejs";
export const maxDuration = 30;

const GEO_METHODOLOGY = {
  collection: "Each approved neutral prompt is submitted into the real UI of every supported AI engine via Playwright / Browserless; the rendered answer + source links are captured.",
  engines: "ChatGPT, Google AI Overviews, Gemini, Claude, Copilot, Perplexity (login engines use captured sessions; no-login engines run logged-out).",
  context: "Fresh, history-free context per query (incognito-style); residential proxy only for localized markets; heavy resources blocked to control cost.",
  parsing: "Brand + competitor mentions (count + first-appearance order) and citations (classified brand/competitor/third-party + order) extracted from the rendered answer; sentiment detected when the language is directional.",
  scoring: "§21 weighted GEO model over the REAL results only. DataForSEO / Moz / SERP are used for prompt context — never for the GEO score.",
};

export async function GET(req) {
  const sp = new URL(req.url).searchParams;
  let projectId = sp.get("projectId");
  const domain = sp.get("domain");
  const withAnswers = sp.get("answers") === "1";
  if (!projectId && !domain) return Response.json({ ok: false, error: "projectId or domain required" }, { status: 400 });

  try {
    // the report only knows the domain → resolve it to the latest geo_project
    if (!projectId && domain) {
      const proj = await getGeoProjectByDomain(domain);
      if (!proj) return Response.json({ ok: true, measured: false, geo_status: buildGeoStatus({ geo: {}, promptsReady: false, runStatus: null }), engines_status: [], run: null, note: "No GEO project found for this domain yet — generate prompts and run collection." });
      projectId = proj.project_id;
    }
    const bundle = await getGeoReportBundle(projectId);
    const run = bundle.run;

    // honest status across the full run lifecycle
    const geo_status = buildGeoStatus({
      geo: { prompt_count: run?.prompt_count || 0 },
      promptsReady: (run?.prompt_count || 0) > 0,
      runStatus: run?.status || null,
      blockedEngines: run?.blocked_engines || [],
    });

    // live per-engine readiness (ready / session_required / not_configured / disabled)
    let engines_status = [];
    try {
      const provider = run ? resolveExecutionProvider(run) : null;
      const adapters = await getEngineAdapters({ provider });
      engines_status = Object.values(adapters).map((a) => ({ engine: a.engine, name: a.name, type: a.type, needs_session: a.needs_session, status: a.status, reason: a.reason }));
    } catch {}

    const base = {
      ok: true,
      measured: geo_status.measured,
      geo_status,
      methodology: GEO_METHODOLOGY,
      engines_status,
      run: run ? { run_id: run.run_id, status: run.status, execution_provider: run.execution_provider } : null,
    };

    // NOT measured → planned/queued/running/session_required/failed: NO numbers (#9).
    if (!geo_status.measured) return Response.json(base);

    // measured → real collected data, prompt-wise + engine-wise + overall (#9/#10).
    const overall = bundle.metrics?.overall || {};
    const prompts_executed = (bundle.results || []).map((r) => ({
      prompt_id: r.prompt_id, prompt: r.raw_prompt, engine: r.engine,
      executed_at: r.created_at, version: r.version,
      citation_count: r.citation_count || 0, source_domains: r.source_domains || [],
      answer_structure: r.answer_structure, parse_confidence: r.parse_confidence,
      ...(withAnswers ? { answer: String(r.rendered_text || "").slice(0, 4000) } : {}),
    }));

    return Response.json({
      ...base,
      run: { ...base.run, completed_at: run.completed_at, engines: run.engines || run.selected_engines, prompt_count: run.prompt_count, completed_count: run.completed_count, failed_count: run.failed_count },
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
