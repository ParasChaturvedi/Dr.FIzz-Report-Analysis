// src/lib/seo/geo/geoStorytelling.js
// ─────────────────────────────────────────────────────────────────────────────
// GEO STORYTELLING (Phase 3, item #10) — Claude deeply analyzes the REAL collected
// GEO data (SoV, mentions, citations, top cited sources, per-engine results, sample
// answers) and narrates it for a founder: where the brand stands in AI search, who
// the engines recommend instead, which sources they trust, and what to do to get cited.
//
// HARD RULE: it narrates ONLY the data passed in (real measured results). If the brand
// has 0 visibility, it says so honestly — it never invents Share-of-Voice, citations,
// mentions, or LLM answers. Returns sections stored via geoStore.saveStorytelling and
// shown in the report. Skipped entirely when there are no real results.
// ─────────────────────────────────────────────────────────────────────────────

const clean = (s) => String(s == null ? "" : s).trim().replace(/\s+/g, " ");

/**
 * @param {object} input
 * @param {string} input.brand
 * @param {Array}  input.competitors  [{name}|string]
 * @param {object} input.metrics      computeGeoMetrics output { overall, by_engine, engines, share_of_voice }
 * @param {Array}  input.parsed       the parsed NormalizedResults (for sample answers)
 * @param {object} input.citationAnalysis { total, brand, competitor, third_party, top_source_domains }
 * @param {string} [input.domain]
 * @returns {Promise<Array<{section_key,title,body,evidence_refs}>>}  [] if no real data / on failure
 */
export async function generateGeoStorytelling({ brand, competitors = [], metrics = {}, parsed = [], citationAnalysis = {}, domain = "" } = {}) {
  const overall = metrics.overall || {};
  const measured = (parsed || []).length > 0;
  if (!measured) return []; // no real data → no story (never fabricate)

  // ── compact, REAL data summary for Claude (no invention) ──
  const sov = metrics.share_of_voice || { engines: [], by_brand: [] };
  const competitorSov = (sov.by_brand || []).filter((b) => !b.is_client && b.avg > 0).map((b) => `${b.brand} ${b.avg}%`);
  const topSources = (citationAnalysis.top_source_domains || []).slice(0, 10).map((d) => `${d.domain} (${d.count}${d.type !== "third_party" ? `, ${d.type}` : ""})`);
  const perEngine = (metrics.engines || []).map((e) => { const m = metrics.by_engine[e] || {}; return `${e}: ${m.prompts_answered || 0} answers, brand SoV ${m.sov || 0}%, brand mentioned in ${m.mention_rate || 0}% of answers`; });
  const samples = (parsed || []).filter((r) => r.renderedText).slice(0, 4).map((r) => `[${r.engine}] Q: ${clean(r.rawPrompt).slice(0, 90)} → ${clean(r.renderedText).slice(0, 320)}`);

  const data = {
    domain: domain || null,
    brand,
    competitors: competitors.map((c) => (typeof c === "string" ? c : c?.name || "")).filter(Boolean),
    geo_score: overall.geo_score,
    brand_share_of_voice_pct: overall.sov,
    brand_mention_rate_pct: overall.mention_rate,
    brand_citation_rate_pct: overall.citation_rate,
    engines_measured: overall.engines_tested,
    brand_total_mentions: overall.brand_mentions,
    competitor_total_mentions: overall.competitor_mentions,
    competitor_share_of_voice: competitorSov,
    most_cited_sources: topSources,
    per_engine: perEngine,
    sample_answers: samples,
  };

  const system = `You are a GEO (Generative Engine Optimization) analyst writing for a non-technical founder. You are given the REAL results of querying AI search engines (ChatGPT, Google AI Overviews, Gemini, Claude, Perplexity, Copilot) about this business's market. Narrate ONLY what the data shows — never invent a Share-of-Voice, citation, mention or answer. If the brand has 0% visibility, say so plainly and turn it into the opportunity.

Write concise, plain-language storytelling. Return ONLY valid JSON, an array of 4-6 sections:
[{"section_key":"where_you_stand|who_ai_recommends|sources_ai_trusts|why_this_matters|what_to_do","title":"short title","body":"2-4 sentences, plain language, grounded in the numbers given"}]

Guidance:
- "where_you_stand": the brand's AI visibility (SoV %, mention rate, GEO score) in plain words.
- "who_ai_recommends": which competitors the engines name instead (use competitor_share_of_voice).
- "sources_ai_trusts": the domains the engines cite (most_cited_sources) — these are the real placement targets.
- "why_this_matters": what 0%/low AI visibility means for the business as AI search grows.
- "what_to_do": concrete actions to get mentioned/cited (e.g. get listed on the cited sources, earn coverage there).`;

  try {
    const { claudeChat } = await import("../../claude/client.js");
    const { content } = await claudeChat({
      messages: [{ role: "system", content: system }, { role: "user", content: "Narrate the GEO findings from this REAL data:\n" + JSON.stringify(data, null, 1) }],
      model: "claude-opus-4-8", max_tokens: 1600, timeoutMs: 70000,
      meta: { domain, api: "geo-storytelling", label: "geo-story" },
    });
    const arr = extractJsonArrayLoose(content);
    if (!Array.isArray(arr)) return [];
    return arr.map((s, i) => ({
      section_key: clean(s?.section_key) || `section_${i + 1}`,
      title: clean(s?.title),
      body: clean(s?.body),
      order: i,
      evidence_refs: [],
    })).filter((s) => s.body);
  } catch (e) {
    try { console.warn("[geoStorytelling]", e?.message); } catch {}
    return [];
  }
}

function extractJsonArrayLoose(text) {
  const s = String(text || "").trim();
  if (!s) return null;
  const tryP = (str) => { try { const v = JSON.parse(str); return Array.isArray(v) ? v : Array.isArray(v?.sections) ? v.sections : null; } catch { return null; } };
  let v = tryP(s); if (v) return v;
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/i); if (fenced?.[1]) { v = tryP(fenced[1].trim()); if (v) return v; }
  const a = s.indexOf("["), b = s.lastIndexOf("]");
  if (a >= 0 && b > a) { v = tryP(s.slice(a, b + 1)); if (v) return v; }
  return null;
}

export default generateGeoStorytelling;
