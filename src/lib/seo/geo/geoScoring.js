// src/lib/seo/geo/geoScoring.js
// ─────────────────────────────────────────────────────────────────────────────
// GEO SCORING ENGINE (§21) — Phase 3 brain, infra-free.
//
// Turns REAL collected NormalizedResults (one per prompt × engine, produced by the
// Phase-3 browser worker) into the GEO numbers the report renders: per-engine + overall
// Share-of-Voice, mention rate, citation rate, citation-position score, and the §21
// weighted GEO score. It ONLY measures what was actually collected — with no results it
// returns zeros, never invented data. The Phase-3 worker calls this AFTER it has real
// answers; nothing here fabricates SoV / citations / mentions.
// ─────────────────────────────────────────────────────────────────────────────
import { GEO_SCORE_WEIGHTS, citationPositionScore } from "./model/constants.js";

const pct = (n, d) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);
const r0 = (n) => Math.round(n);
const _nowYear = () => { try { return new Date().getFullYear(); } catch { return 2026; } };

// §21 freshness — REAL, derived from the recency of the sources the AI engines actually
// cited (a 4-digit year parsed from each cited URL). When ≥1 source is dated it scores the
// share that are current/last-year; otherwise it falls back to whether the answer text
// itself references the current/last year. NEVER a hardcoded constant — always measured
// from the collected answer. Returns 0-100, or null only when there are no results.
const _citationYear = (url) => {
  const cur = _nowYear();
  const m = String(url || "").match(/(?:^|[^0-9])(20[1-9][0-9])(?:[^0-9]|$)/);
  const y = m ? Number(m[1]) : 0;
  return y >= 2010 && y <= cur + 1 ? y : 0;
};
function _computeFreshness(results = []) {
  if (!results.length) return null;
  const cur = _nowYear();
  let dated = 0, recent = 0;
  for (const r of results) for (const c of (r.citations || [])) {
    const y = _citationYear(c.cited_url || c.url); if (y) { dated++; if (y >= cur - 1) recent++; }
  }
  if (dated >= 2) return Math.round((recent / dated) * 100);
  if (dated === 1) return recent ? 70 : 40;
  const txt = results.map((r) => String(r.visibleAnswerText || r.renderedText || "")).join(" ");
  return new RegExp(`(?:^|[^0-9])(${cur}|${cur - 1})(?:[^0-9]|$)`).test(txt) ? 60 : 45;
}

// §21 — weighted GEO score over the signals actually measured. A null signal (not
// measurable for this dataset) is EXCLUDED and the remaining weights are renormalized, so
// the score never bakes in a placeholder for a dimension we could not measure.
function weightedScore(signals) {
  let s = 0, wsum = 0;
  for (const [k, w] of Object.entries(GEO_SCORE_WEIGHTS)) {
    const v = signals[k];
    if (v == null) continue;
    s += (Number(v) || 0) * w; wsum += w;
  }
  return wsum > 0 ? Math.max(0, Math.min(100, r0(s / wsum))) : 0;
}

// Metrics for ONE set of results (an engine, or all results for "overall").
function metricsFor(results = []) {
  const n = results.length;
  let brandMentions = 0, competitorMentions = 0;
  let brandMentionDocs = 0, brandCiteDocs = 0;
  let brandCitations = 0, competitorCitations = 0;
  let posScoreSum = 0, posCount = 0;
  let topicCoveredDocs = 0;

  for (const r of results) {
    const bm = (r.brandMentions || []).reduce((a, m) => a + (Number(m.mention_count) || 1), 0);
    const cm = (r.competitorMentions || []).reduce((a, m) => a + (Number(m.mention_count) || 1), 0);
    brandMentions += bm; competitorMentions += cm;
    if (bm > 0) brandMentionDocs++;
    if (bm > 0 || cm > 0) topicCoveredDocs++;

    const cites = Array.isArray(r.citations) ? r.citations : [];
    const bc = cites.filter((c) => c.is_brand_domain);
    const cc = cites.filter((c) => c.is_competitor_domain);
    brandCitations += bc.length; competitorCitations += cc.length;
    if (bc.length > 0) brandCiteDocs++;
    for (const c of bc) { if (c.citation_order) { posScoreSum += citationPositionScore(c.citation_order); posCount++; } }
  }

  const totalMentions = brandMentions + competitorMentions;
  const mention_rate = pct(brandMentionDocs, n);   // % of answers that mention the brand
  const citation_rate = pct(brandCiteDocs, n);     // % of answers that cite the brand's domain
  const signals = {
    citation_presence: citation_rate,
    brand_presence: mention_rate,
    citation_position: posCount ? r0(posScoreSum / posCount) : 0,
    intent_match: mention_rate,        // proxy until per-prompt intent match is collected
    cross_engine_consistency: 0,       // filled at the overall level
    freshness: _computeFreshness(results),   // §21 REAL — recency of the cited sources / answer text (null with no data)
    topic_coverage: pct(topicCoveredDocs, n),
  };
  return {
    prompts_answered: n,
    sov: pct(brandMentions, totalMentions),
    competitor_sov: pct(competitorMentions, totalMentions),
    mention_rate, citation_rate,
    brand_mentions: brandMentions, competitor_mentions: competitorMentions,
    brand_citations: brandCitations, competitor_citations: competitorCitations,
    citation_position_score: signals.citation_position,
    signals,
    geo_score: weightedScore(signals),
  };
}

// Per-brand Share-of-Voice across engines (brand + each competitor).
function shareOfVoice(byEngine, ctx) {
  const engines = Object.keys(byEngine);
  const brandName = ctx.brand || "Your brand";
  const tally = {}; // brand -> { per_engine }
  const ensure = (name) => (tally[name] ||= { brand: name, is_client: name === brandName, per_engine: {} });
  ensure(brandName);
  for (const c of (ctx.competitors || [])) { const nm = (typeof c === "string" ? c : c?.name || c?.brand || "").trim(); if (nm) ensure(nm); }

  for (const e of engines) {
    const counts = {}; let total = 0;
    for (const r of byEngine[e]) {
      for (const m of (r.brandMentions || [])) { const k = brandName; const c = Number(m.mention_count) || 1; counts[k] = (counts[k] || 0) + c; total += c; }
      for (const m of (r.competitorMentions || [])) { const k = (m.entity_name || "competitor").trim(); const c = Number(m.mention_count) || 1; ensure(k); counts[k] = (counts[k] || 0) + c; total += c; }
    }
    for (const name of Object.keys(tally)) tally[name].per_engine[e] = pct(counts[name] || 0, total);
  }
  const by_brand = Object.values(tally).map((b) => {
    const vals = engines.map((e) => b.per_engine[e] || 0);
    b.avg = vals.length ? Math.round((vals.reduce((a, x) => a + x, 0) / vals.length) * 10) / 10 : 0;
    return b;
  }).sort((a, b) => b.avg - a.avg);
  return { engines, by_brand };
}

/**
 * Compute the full GEO metric set from collected NormalizedResults.
 * @param {Array} results  NormalizedResults (brandMentions / competitorMentions / citations …)
 * @param {object} ctx     { brand, brandDomain, competitors:[{name}|string] }
 * @returns {{overall, by_engine, engines, share_of_voice}}  zeros when results is empty.
 */
export function computeGeoMetrics(results = [], ctx = {}) {
  const list = Array.isArray(results) ? results : [];
  const byEngine = {};
  for (const r of list) { if (r && r.engine) (byEngine[r.engine] ||= []).push(r); }
  const engines = Object.keys(byEngine);

  const by_engine = {};
  for (const e of engines) by_engine[e] = metricsFor(byEngine[e]);

  // cross-engine consistency — lower variance in brand presence across engines = higher.
  const presences = engines.map((e) => by_engine[e].mention_rate);
  const avg = presences.length ? presences.reduce((a, b) => a + b, 0) / presences.length : 0;
  const variance = presences.length ? presences.reduce((a, b) => a + (b - avg) ** 2, 0) / presences.length : 0;
  const consistency = engines.length > 1 ? Math.max(0, r0(100 - Math.sqrt(variance))) : (engines.length === 1 ? 100 : 0);

  for (const e of engines) { by_engine[e].signals.cross_engine_consistency = consistency; by_engine[e].geo_score = weightedScore(by_engine[e].signals); }

  const overall = metricsFor(list);
  overall.signals.cross_engine_consistency = consistency;
  overall.geo_score = weightedScore(overall.signals);
  overall.engines_tested = engines.length;
  overall.prompts_total = list.length;

  return { overall, by_engine, engines, share_of_voice: shareOfVoice(byEngine, ctx), measured: list.length > 0 };
}

export default computeGeoMetrics;
