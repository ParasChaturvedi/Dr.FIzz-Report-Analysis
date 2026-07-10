// src/app/components/report/deck/illustrative.js
// ─────────────────────────────────────────────────────────────────────────────
// LABELED-ILLUSTRATIVE FALLBACKS — when real data hasn't been collected yet
// (competitor benchmark, GEO before a scan), the deck shows realistic,
// COMPETITOR-RELATIVE numbers in the live payload's shape, ALWAYS clearly tagged
// "Illustrative" in the UI. Matches the reference deck: the template looks
// complete, the real collection drops straight into the same layout, and nothing
// is presented as measured. Deterministic (no randomness) so reports are stable.
// ─────────────────────────────────────────────────────────────────────────────

// The 5 canonical engines actually scanned (Microsoft Copilot stays out, still hard-blocked, so it
// must NOT appear even in the illustrative fallback / Sample-Prompts slide). Keep in sync with
// GEO_ENGINES in src/lib/seo/geo/model/constants.js.
const ENGINES = ["Google AI Overviews", "Claude", "Gemini", "Perplexity", "ChatGPT"];

// Per-engine illustrative profile for the CLIENT (low-but-present visibility, the
// typical "ready to be quoted, not yet chosen" shape). Values are realistic and
// internally consistent (Perplexity leads, Google AIO lags).
const CLIENT_BY_ENGINE = {
  "Google AI Overviews":{ sov: 0, mention_rate: 0,  citation_rate: 0 },
  "Claude":             { sov: 3, mention_rate: 9,  citation_rate: 3 },
  "Gemini":             { sov: 2, mention_rate: 5,  citation_rate: 0 },
  "Perplexity":         { sov: 6, mention_rate: 15, citation_rate: 5 },
  "ChatGPT":            { sov: 3, mention_rate: 8,  citation_rate: 1 },
};

const clean = (c) => (typeof c === "string" ? c : (c?.name || c?.brand || c?.domain || "")).trim();

// Competitor-relative Share of Voice: leader high, descending, client near the floor.
function buildShareOfVoice(name, competitors) {
  // item 9 — show EVERY configured competitor as its own row (was capped at 4, which hid the
  // 5th+ competitor even at a low share in the pre-scan illustrative state). Cap at 8 so the
  // slide can't overflow; each beyond the named leaders gets a small descending share.
  const comp = competitors.map(clean).filter(Boolean).slice(0, 8);
  const shares = [28, 24, 16, 10, 7, 5, 4, 3]; // leader → 8th, descending
  const by = comp.map((b, i) => ({
    brand: b, is_client: false, avg: shares[i] ?? 3,
    // Per-metric values so the mention/citation slides cite distinct leader benchmarks
    // (leader SoV 28 → ~61% mention, ~24% citation, matching the reference shape).
    mention_rate: Math.round((shares[i] ?? 8) * 2.18),
    citation_rate: Math.round((shares[i] ?? 8) * 0.86),
    per_engine: ENGINES.reduce((m, e, j) => ((m[e] = Math.max(0, (shares[i] ?? 8) + ((j % 3) - 1) * 2)), m), {}),
  }));
  by.push({ brand: name, is_client: true, avg: 3, mention_rate: 9, citation_rate: 2, per_engine: ENGINES.reduce((m, e) => ((m[e] = CLIENT_BY_ENGINE[e].sov), m), {}) });
  return by.sort((a, b) => b.avg - a.avg);
}

// Sample buyer prompts (the raw evidence layer) — competitor-named, plausible outcomes.
// Market/industry-NEUTRAL wording (no hardcoded "UK"/industry) so the template never
// looks wrong for a client; `topic` (client's primary service) is woven in when given.
function buildPrompts(name, competitors, topic = "") {
  const comp = competitors.map(clean).filter(Boolean);
  const lead = comp[0] || "a national rival", second = comp[1] || "a rival", third = comp[2] || comp[0] || "a rival";
  const svc = topic || "your service";
  return [
    { prompt: `Best ${svc} provider for businesses like mine?`, engine: "Gemini", brands_named: [lead, second, third], brand_mentioned: false, competitor_mention_count: 3, citation_count: 0 },
    { prompt: `Who offers ${svc} for small businesses?`, engine: "Perplexity", brands_named: [lead, name], brand_mentioned: true, competitor_mention_count: 1, citation_count: 0 },
    { prompt: "Trusted partner in my city for this?", engine: "Claude", brands_named: ["generic firms"], brand_mentioned: false, competitor_mention_count: 0, citation_count: 0 },
    { prompt: `Top-rated ${svc} providers?`, engine: "Claude", brands_named: [third, name], brand_mentioned: true, competitor_mention_count: 1, citation_count: 1 },
    { prompt: `Most cost-effective ${svc} option?`, engine: "Gemini", brands_named: [lead, second], brand_mentioned: false, competitor_mention_count: 2, citation_count: 0 },
    { prompt: "What is the service and who provides it?", engine: "Perplexity", brands_named: [second, name], brand_mentioned: true, competitor_mention_count: 1, citation_count: 1 },
    { prompt: "Best-reviewed providers near me?", engine: "Google AI Overviews", brands_named: [lead, third], brand_mentioned: false, competitor_mention_count: 2, citation_count: 0 },
  ];
}

// Full illustrative GEO bundle in the SAME shape the live /api/seo/geo/report returns.
export function buildIllustrativeGeo({ name = "Your brand", competitors = [], topics = [] } = {}) {
  const share_of_voice = buildShareOfVoice(name, competitors);
  const by_engine = ENGINES.map((e) => ({
    engine: e,
    metrics: { ...CLIENT_BY_ENGINE[e], prompts_answered: 1 },
    ...CLIENT_BY_ENGINE[e], prompts_answered: 1,
  }));
  const topicList = (topics.length ? topics : ["Core service", "Adjacent service", "Local intent", "Specialist niche", "Comparison terms", "How-to / advice"]).slice(0, 8);
  const topic_dominance = {
    by_brand: [{
      brand: name, is_client: true,
      won_topics: topicList.slice(0, 1),
      contested_topics: topicList.slice(1, 4),
      lost_topics: topicList.slice(4, 8),
    }],
  };
  return {
    illustrative: true, measured: false,
    overall: { geo_score: 18, sov: 3, mention_rate: 9, citation_rate: 2, engines_tested: 5, prompts_total: null, prompts_answered: null },
    share_of_voice, by_engine,
    prompts_executed: buildPrompts(name, competitors, topics[0] || ""),
    topic_dominance,
    score_breakdown: { signals: { citation_presence: 6, brand_presence: 9, citation_position: 12, intent_match: 9, cross_engine_consistency: 70, topic_coverage: 25 } },
    engines_status: ENGINES.map((e) => ({ engine: e, name: e, status: "illustrative" })),
    mentions_summary: { prompts_with_brand: null, brand_mentions: null, competitor_mentions: null },
    // item 8 — provide top_source_domains so the "who AI cites instead of you" fallback has
    // something to show in the illustrative state (competitor-relative, clearly not measured).
    citation_analysis: {
      total: 14, brand: 2, competitor: 9, third_party: 3,
      top_source_domains: (competitors.map(clean).filter(Boolean).slice(0, 4)).map((b, i) => ({
        domain: `${slugForDomain(b)}.com`, count: [5, 4, 3, 2][i] ?? 1, type: "competitor",
      })),
    },
  };
}

// tiny slug helper for illustrative competitor domains (no external dep)
function slugForDomain(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 24) || "competitor";
}

// Illustrative per-competitor SEO benchmark (DR / traffic / keywords / referring
// domains), scaled by each competitor's stated strength so it stays plausible and
// competitor-relative. Client row stays REAL (passed in).
export function buildIllustrativeBenchmark(competitors = []) {
  const tiers = {
    high:   [{ dr: 62, traffic: 48000, keywords: 9400, refDomains: 2100 }, { dr: 44, traffic: 9800, keywords: 2600, refDomains: 510 }],
    medium: [{ dr: 41, traffic: 6200, keywords: 1850, refDomains: 380 }, { dr: 38, traffic: 21000, keywords: 4300, refDomains: 430 }],
    low:    [{ dr: 33, traffic: 3100, keywords: 920, refDomains: 240 }],
  };
  let hi = 0, me = 0, lo = 0;
  return competitors.map((c) => {
    const s = String(c?.strength || c?.threat || "medium").toLowerCase();
    let t;
    if (/high|alert/.test(s)) { t = tiers.high[hi % tiers.high.length]; hi++; }
    else if (/low/.test(s)) { t = tiers.low[lo % tiers.low.length]; lo++; }
    else { t = tiers.medium[me % tiers.medium.length]; me++; }
    return { name: c?.name || c?.domain, ...t };
  });
}
