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
import { isBrandNoise, isTopicNoise } from "./geoParser.js";

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
  // §5 — mention/citation rates must be measured over the runs that RETURNED AN ANSWER, not over
  // every prompt. A login-wall / non-answer run is not a "mention miss". nAnswered is the honest
  // denominator; fall back to n only if nothing answered (avoids divide-by-zero).
  const _answered = (r) => !r?.nonAnswer && (
    Number(r?.answerLength) > 0 ||
    (Array.isArray(r?.brandMentions) && r.brandMentions.length > 0) ||
    (Array.isArray(r?.competitorMentions) && r.competitorMentions.length > 0) ||
    (Array.isArray(r?.citations) && r.citations.length > 0) ||
    String(r?.renderedText || r?.answerText || "").trim().length > 20
  );
  const nAnswered = results.filter(_answered).length || n;
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
  const mention_rate = pct(brandMentionDocs, nAnswered);   // % of ANSWERED runs that mention the brand (§5)
  const citation_rate = pct(brandCiteDocs, nAnswered);     // % of ANSWERED runs that cite the brand's domain (§5)
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
    prompts_answered: nAnswered,          // §5 — runs that returned an answer (the rate denominator)
    prompts_total: n,                     // §5 — all runs, so the answered/total basis is auditable
    sov: pct(brandMentions, totalMentions),   // SoV denominator is total brand mentions (already correct)
    sov_total_mentions: totalMentions,    // §5 — expose the SoV denominator so the % is auditable
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
  // Configured competitors are ALWAYS legitimate (the user chose them) — even when their name is all-generic
  // ("Digital Web Solutions", "First Page", "Web Solutions"). Track them so the topic-noise filter below
  // NEVER strips a configured rival off the SoV board (item-9 guarantees every configured competitor shows).
  const _configured = new Set();
  for (const c of (ctx.competitors || [])) { const nm = (typeof c === "string" ? c : c?.name || c?.brand || "").trim(); if (nm) { ensure(nm); _configured.add(nm.toLowerCase()); } }

  // DISCOVERED competitors — brands the AI actually named that were NOT configured. Real market
  // intel worth showing. Noise guard: only keep a brand that surfaced in ≥2 DISTINCT prompts, then
  // take the top few by prompt-spread. These fold into the same SoV math (tagged discovered:true).
  const discPrompts = {}; // name -> Set(promptId)
  for (const e of engines) for (const r of (byEngine[e] || [])) {
    const pid = r.promptId || r.prompt_id || `${e}:${String(r.rawPrompt || "").slice(0, 40)}`;
    for (const d of (r.discoveredBrands || [])) { const nm = String(d?.name || "").trim(); if (nm) (discPrompts[nm] ||= new Set()).add(pid); }
  }
  const discSet = new Set(
    Object.entries(discPrompts)
      .filter(([, s]) => s.size >= 2)      // must recur across ≥2 distinct prompts (this guards one-off noise)
      .filter(([n]) => !isTopicNoise(n))   // drop ONLY topic/UI noise (KPIs, GBP, "…Opens") — keep real single-word rivals (Techmagnate, Uplers) so SoV matches the p15 "who it named" column
      // never surface a discovered row for the CLIENT or a CONFIGURED competitor (case-insensitive) —
      // else "Bookstime" (AI-named) duplicates the tracked "bookstime" row on the SoV board.
      .filter(([n]) => { const l = n.toLowerCase(); return l !== String(brandName).toLowerCase() && !_configured.has(l); })
      .sort((a, b) => b[1].size - a[1].size).slice(0, 5).map(([n]) => n)
  );
  for (const n of discSet) tally[n] ||= { brand: n, is_client: false, discovered: true, per_engine: {} };

  const totalCounts = {};   // B11 — raw cross-engine mention count per brand, so the SoV % has a visible denominator
  for (const e of engines) {
    const counts = {}; let total = 0;
    const _add = (k, c) => { counts[k] = (counts[k] || 0) + c; total += c; totalCounts[k] = (totalCounts[k] || 0) + c; };
    for (const r of byEngine[e]) {
      for (const m of (r.brandMentions || [])) { const c = Number(m.mention_count) || 1; _add(brandName, c); }
      for (const m of (r.competitorMentions || [])) { const k = (m.entity_name || "competitor").trim();
        // §5 — a competitorMention entity can be topic/UI noise the collector mis-tagged as a rival
        // ("Google Business Profile", "KPIs", "…Opens"). DROP it here so it never enters counts OR the
        // total: this keeps it off the SoV bars AND re-normalizes the real brands' percentages.
        // isTopicNoise (NOT isBrandNoise) so real lowercase rivals — pagetraffic, webchutney — survive.
        if (!k || (isTopicNoise(k) && !_configured.has(k.toLowerCase()))) continue;
        const c = Number(m.mention_count) || 1; ensure(k); _add(k, c); }
      for (const d of (r.discoveredBrands || [])) { const k = String(d?.name || "").trim(); if (!k || !discSet.has(k)) continue; const c = Number(d.count) || 1; _add(k, c); }
    }
    for (const name of Object.keys(tally)) tally[name].per_engine[e] = pct(counts[name] || 0, total);
  }
  const by_brand0 = Object.values(tally)
    .filter((b) => b.is_client || _configured.has(String(b.brand).toLowerCase()) || !isTopicNoise(b.brand))   // §5 belt: drop topic/noise "brands" but NEVER a configured competitor (keeps every chosen rival, incl. all-generic-named ones, at ≥0%)
    .map((b) => {
      const vals = engines.map((e) => b.per_engine[e] || 0);
      b.avg = vals.length ? Math.round((vals.reduce((a, x) => a + x, 0) / vals.length) * 10) / 10 : 0;
      b.mentions = totalCounts[b.brand] || 0;   // B11 — the underlying mention count behind the %
      return b;
    }).sort((a, b) => b.avg - a.avg);
  // DEDUP by lowercased brand — a configured competitor ("bookstime") and its canonicalised
  // parser casing ("Bookstime") are the SAME brand and must be ONE row (keep the higher share,
  // OR the client/discovered flags, prefer the capitalised display name, sum the mention count).
  const _seen = {};
  const by_brand = [];
  for (const b of by_brand0) {
    const key = String(b.brand).toLowerCase();
    const m = _seen[key];
    if (m) {
      m.is_client = m.is_client || b.is_client;
      m.discovered = !!m.discovered && !!b.discovered;
      m.mentions = (m.mentions || 0) + (b.mentions || 0);
      if ((b.avg || 0) > (m.avg || 0)) { m.avg = b.avg; m.per_engine = b.per_engine; }
      if (/[A-Z]/.test(b.brand) && !/[A-Z]/.test(m.brand)) m.brand = b.brand;
      continue;
    }
    _seen[key] = b; by_brand.push(b);
  }
  by_brand.sort((a, b) => b.avg - a.avg);
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

  // GS1 — GATE readiness signals on real visibility. "Consistency 100%" while named in 0% of answers is
  // consistency of ABSENCE, and freshness/topic can't lift a brand that is never cited/named. When the
  // visibility base (citation OR brand presence) is 0, EXCLUDE cross_engine_consistency + freshness from
  // the score (set null → weightedScore drops them) so a brand cited 0% can't post an inflated 15.
  const _gateReadiness = (sig) => {
    const presence = Math.max(Number(sig.citation_presence) || 0, Number(sig.brand_presence) || 0);
    if (presence <= 0) { sig.cross_engine_consistency = null; sig.freshness = null; }
  };
  for (const e of engines) { by_engine[e].signals.cross_engine_consistency = consistency; _gateReadiness(by_engine[e].signals); by_engine[e].geo_score = weightedScore(by_engine[e].signals); }

  const overall = metricsFor(list);
  overall.signals.cross_engine_consistency = consistency;
  overall.signals.cross_engine_consistency_raw = consistency;   // keep the raw value for the readiness panel
  _gateReadiness(overall.signals);
  overall.geo_score = weightedScore(overall.signals);
  overall.engines_tested = engines.length;
  overall.prompts_total = list.length;

  const share_of_voice = shareOfVoice(byEngine, ctx);
  // SOV2 — the HEADLINE SoV must use the SAME full-set denominator as the by_brand chart (every
  // brand the AI named), NOT client-vs-tracked-only. Otherwise the title ("you hold 69 of 100")
  // contradicts the chart ("you 11%"). Adopt the client's share from the full-set chart so the two agree.
  const _clientRow = (share_of_voice.by_brand || []).find((b) => b.is_client);
  if (_clientRow) {
    overall.sov = _clientRow.avg;
    overall.competitor_sov = Math.max(0, r0(100 - _clientRow.avg));
    // X3 — the PER-ENGINE sov must ALSO use the full named-brand denominator, NOT client-vs-tracked.
    // Else the "share of voice by platform" panel shows the client at 100% on an engine where it is
    // simply the only TRACKED brand that appeared — impossible next to an 8% overall. Adopt the
    // client's per-engine share straight from the full-set chart so the panel is consistent.
    for (const e of engines) {
      if (by_engine[e]) by_engine[e].sov = r0(Number(_clientRow.per_engine?.[e]) || 0);
    }
  }

  return { overall, by_engine, engines, share_of_voice, measured: list.length > 0 };
}

export default computeGeoMetrics;
