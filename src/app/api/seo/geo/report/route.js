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
import { getGeoReportBundle, getGeoProjectByDomain, getGeoPrompts } from "@/lib/seo/geo/model/geoStore";
import { parseAnswer, isTopicNoise } from "@/lib/seo/geo/geoParser";
import { buildGeoStatus } from "@/lib/seo/report-evidence";
import { getEngineAdapters } from "@/lib/seo/geo/engineAdapters";
import { resolveExecutionProvider } from "@/lib/seo/geo/executionProvider";
import { buildTopicDominance } from "@/lib/seo/doctor-fizz-logic";

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

    // measured → FULL real collected data, in maximum detail (#9/#10).
    const overall = bundle.metrics?.overall || {};
    const results = bundle.results || [];
    const citationDocs = bundle.citations || [];
    const errs = bundle.errors || [];

    // Results don't store the prompt's campaign, so join it in: the deck groups the prompts
    // into the 3 architect campaigns (Citation Commercial / Mentions / Citation Information).
    let clusterById = {};
    try {
      const promptDocs = await getGeoPrompts(projectId);
      for (const p of (promptDocs || [])) if (p && p.prompt_id) clusterById[p.prompt_id] = p.cluster || "";
    } catch { clusterById = {}; }

    // §6 RECALL — re-derive "who it named" from the STORED answer text with the CURRENT parser, so real
    // agencies an older worker parse dropped (single-word Title-case names: Techmagnate, Uplers, Sparklin)
    // are surfaced. ADDITIVE (union with the worker's list) + topic-noise filtered — it can only ADD real
    // brands, never lose a stored one. No re-scan needed; runs on already-collected answers.
    const _geoCtx = { brand: run?.target_brand || run?.brand_name || "", brandDomain: run?.brand_domain || "", competitors: Array.isArray(run?.competitors) ? run.competitors : [] };
    const _deriveNamed = (r) => {
      const worker = Array.isArray(r.brands_mentioned) ? r.brands_mentioned : [];
      let derived = [];
      try {
        const p = parseAnswer({ visibleAnswerText: r.rendered_text || "", renderedText: r.rendered_text || "", engine: r.engine, rawPrompt: r.raw_prompt }, _geoCtx);
        derived = Array.isArray(p.brandsMentioned) ? p.brandsMentioned : [];
      } catch {}
      const seen = new Set(); const out = [];
      for (const n of [...worker, ...derived]) { const s = String(n || "").trim(); const k = s.toLowerCase(); if (!s || seen.has(k) || isTopicNoise(s)) continue; seen.add(k); out.push(s); if (out.length >= 6) break; }
      return out;
    };

    // §feedback (Mentions vs Citations) — classify each cited SOURCE independently of the mention, using the
    // REAL per-citation provenance the collector already stored. Deterministic, never inferred from the mention:
    // owned (brand's domain) > competitor (a configured rival's domain) > third_party (directory/publisher/forum).
    const _citeType = {};   // prompt_id -> { bareDomain -> "owned"|"competitor"|"third_party" }
    for (const c of citationDocs) {
      const pid = c.prompt_id; const dom = String(c.cited_domain || "").replace(/^www\./, "").toLowerCase();
      if (!pid || !dom) continue;
      (_citeType[pid] ||= {})[dom] = c.is_brand_domain ? "owned" : c.is_competitor_domain ? "competitor" : "third_party";
    }

    const prompts_executed = results.map((r) => {
      const _named = _deriveNamed(r);                                         // answer entities (mentions) — separate axis
      const _typed = (Array.isArray(r.source_domains) ? r.source_domains : []) // citation sources — separate axis, typed
        .map((d) => {
          const dom = String(d).replace(/^www\./, "");
          // provenance: owned/competitor/third-party from the REAL flags; a blank/malformed domain → "unknown" (R2, never inferred)
          const type = !dom ? "unknown" : ((_citeType[r.prompt_id] || {})[dom.toLowerCase()] || "third_party");
          // support strength (R7): the source IS the entity (owned/competitor) = direct; a directory that lists it = indirect
          const support_strength = type === "unknown" ? "unknown" : (type === "owned" || type === "competitor") ? "direct" : "indirect";
          return { source: dom, type, support_strength };
        });
      const _len = Number(r.answer_length) || 0;
      const _noAnswer = r.answer_structure === "no_answer" || (_len === 0 && !(r.source_domains || []).length && !r.brand_mentioned);
      const _conf = Number(r.parse_confidence) || 0;
      return {
        prompt_id: r.prompt_id, prompt: r.raw_prompt, engine: r.engine,
        cluster: clusterById[r.prompt_id] || r.cluster || "",   // campaign tag for the deck's 3-way split
        executed_at: r.created_at, version: r.version,
        brand_mentioned: !!r.brand_mentioned, brand_mention_count: r.brand_mention_count || 0, competitor_mention_count: r.competitor_mention_count || 0,
        brands_named: _named,   // real "who it named" column (deck slide 12) — worker list ∪ re-parsed, noise-filtered
        brand_cited: !!r.brand_cited,   // citation-truth: brand's OWN domain was a real source (not just "answer had citations")
        answer_length: _len,   // distinguishes "answered, none named" from "no answer" (deck dash clarity)
        citation_count: r.citation_count || 0, source_domains: r.source_domains || [],
        // §feedback — explicit, INDEPENDENT mention/citation schema (real derived data, no inference, no blanks):
        cited_typed: _typed,                                          // [{source, type: owned|competitor|third_party|unknown, support_strength}]
        mention_status: _noAnswer ? "no_answer" : (_named.length ? "present" : "absent"),   // was any entity NAMED (or the engine didn't answer)
        citation_status: _noAnswer ? "no_answer" : (_typed.length ? "present" : "absent"),  // was any SOURCE cited (independent of mention)
        result_status: r.brand_mentioned ? "named" : (_noAnswer ? "no_answer" : "not_named"),  // brand's visibility outcome (explicit no_answer)
        confidence: _conf,                                           // real parser confidence for this result
        needs_review: _conf > 0 && _conf < 0.5,                      // R8 — low-confidence result flagged for manual review
        notes: _noAnswer ? "engine returned no answer (login wall / interface only)"
          : (r.brand_mentioned ? "" : (_named.length || _typed.length) ? `brand absent; ${_named.length} rival(s) named, ${_typed.length} source(s) cited`
          : "answered, but no brand named and no source cited"),   // R7 notes — deterministic reason, never blank on a null outcome
        answer_structure: r.answer_structure, sentiment: r.sentiment || null, parse_confidence: r.parse_confidence,
        ...(withAnswers ? { answer: String(r.rendered_text || "").slice(0, 4000) } : {}),
      };
    });

    // citation analysis — brand vs competitor vs third-party + the most-cited domains (#9)
    const domainAgg = {};
    let citeBrand = 0, citeComp = 0, citeThird = 0;
    for (const c of citationDocs) {
      if (c.is_brand_domain) citeBrand++; else if (c.is_competitor_domain) citeComp++; else citeThird++;
      const d = c.cited_domain || ""; if (!d) continue;
      domainAgg[d] = domainAgg[d] || { domain: d, count: 0, type: c.is_brand_domain ? "brand" : c.is_competitor_domain ? "competitor" : "third_party" };
      domainAgg[d].count++;
    }
    const top_source_domains = Object.values(domainAgg).sort((a, b) => b.count - a.count).slice(0, 20);

    // sentiment summary (only where the brand was mentioned with directional language)
    const sentiment_summary = { positive: 0, neutral: 0, negative: 0 };
    for (const r of results) { if (r.sentiment && sentiment_summary[r.sentiment] != null) sentiment_summary[r.sentiment]++; }

    // collection health — what succeeded / what failed and why (transparency)
    const errByEngine = {};
    for (const e of errs) { const k = e.engine || "?"; (errByEngine[k] = errByEngine[k] || { engine: k, count: 0, types: {} }); errByEngine[k].count++; const t = e.error_type || "other"; errByEngine[k].types[t] = (errByEngine[k].types[t] || 0) + 1; }

    // Per-topic competitive dominance — which brand each AI engine leads on, and the topics
    // you're absent from (lost) or present-but-losing (contested). Deterministic topic model
    // over the REAL collected answers; brandSet derived from the already-scored SoV.
    let topic_dominance = null;
    try {
      const byBrand = overall.share_of_voice?.by_brand || [];
      const brandSet = byBrand.map((b) => b.brand).filter(Boolean);
      if (brandSet.length >= 2) {
        const client = (byBrand.find((b) => b.is_client) || {}).brand || brandSet[0];
        const tdResponses = results.map((r) => ({ prompt: r.raw_prompt, answerText: r.rendered_text || "", brandsMentioned: r.brands_mentioned, leadBrand: r.lead_brand }));
        topic_dominance = buildTopicDominance({ brandSet, client, responses: tdResponses });
      }
    } catch {}

    return Response.json({
      ...base,
      run: { ...base.run, completed_at: run.completed_at, engines: run.engines || run.selected_engines, prompt_count: run.prompt_count, completed_count: run.completed_count, failed_count: run.failed_count },
      overall: { geo_score: overall.geo_score, sov: overall.sov, competitor_sov: overall.competitor_sov, mention_rate: overall.mention_rate, citation_rate: overall.citation_rate, engines_tested: overall.engines_tested, citation_position_score: overall.citation_position_score, brand_mentions: overall.brand_mentions, competitor_mentions: overall.competitor_mentions, brand_citations: overall.brand_citations, competitor_citations: overall.competitor_citations,
        // real measured signals previously dropped by the whitelist — surfaced in the render
        topic_coverage: overall.signals?.topic_coverage ?? null, cross_engine_consistency: overall.signals?.cross_engine_consistency ?? null,
        prompts_answered: overall.prompts_answered ?? null, prompts_total: overall.prompts_total ?? results.length },
      score_breakdown: { signals: overall.signals || {}, cross_engine_consistency: overall.signals?.cross_engine_consistency ?? null },
      mentions_summary: { brand_mentions: overall.brand_mentions || 0, competitor_mentions: overall.competitor_mentions || 0, prompts_with_brand: results.filter((r) => r.brand_mentioned).length, prompts_total: results.length },
      citation_analysis: { total: citationDocs.length, brand: citeBrand, competitor: citeComp, third_party: citeThird, top_source_domains },
      sentiment_summary,
      collection_health: { results_saved: results.length, errors: errs.length, by_engine: Object.values(errByEngine) },
      // Claude storytelling generated FROM the collected data (#10) — empty until generated.
      storytelling: (bundle.storytelling || []).map((s) => ({ section_key: s.section_key, title: s.title, body: s.body, order: s.order })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
      by_engine: bundle.metrics?.by_engine || [],
      share_of_voice: overall.share_of_voice || null,
      topic_dominance,
      prompts_executed,
      citations: citationDocs.map((c) => ({ engine: c.engine, prompt_id: c.prompt_id, cited_domain: c.cited_domain, cited_url: c.cited_url, citation_order: c.citation_order, is_brand_domain: c.is_brand_domain, is_competitor_domain: c.is_competitor_domain })),
    });
  } catch (e) {
    return Response.json({ ok: false, error: String(e?.message || e).slice(0, 200) }, { status: 500 });
  }
}
