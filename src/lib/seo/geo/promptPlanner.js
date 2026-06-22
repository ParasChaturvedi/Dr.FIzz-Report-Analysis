// src/lib/seo/geo/promptPlanner.js
// ─────────────────────────────────────────────────────────────────────────────
// GEO §17 — SCALABLE SEMANTIC-CLUSTERED PROMPT PLANNER (Phase 2)
//
// Turns REAL project signals (industry, location, DataForSEO keywords, competitor
// keywords, business/search competitors, service categories, topic gaps, homepage
// content, search intent) into a balanced, de-duplicated, scored set of GEO prompts
// sized to the chosen run mode:
//     smoke  20–25 · standard 60–80 · full 150–250
//
// This is PURE PLANNING — it generates and scores prompts but DOES NOT execute them
// in any AI engine and NEVER calls Browserless. Persistence is handled by the caller
// (promptService → geoStore). Generation pipeline:
//   1. allocateQuotas()         — distribute the target across all 14 clusters with a
//                                 floor + cap so no single topic dominates (§14).
//   2. Claude batched gen        — grounded, semantic prompts per cluster (no hardcoded
//                                 final prompts); falls back / tops up deterministically.
//   3. deterministic fill        — data-grounded template expansion (real keywords /
//                                 competitors / locations) to reach each cluster quota.
//   4. location variants (§13)   — city/region/country variants for localized clusters,
//                                 using ONLY real locations present in the data.
//   5. dedupe (§10)              — normalized token signature collapses near-duplicates.
//   6. quality score (§11)       — 0–100; neutrality violations are near-rejected.
//   7. priority score (§12)      — cluster weight + intent value + keyword volume.
//   8. balance + trim            — enforce per-cluster cap + land inside the mode band.
//
// The deterministic path is fully data-grounded and never empty, so planning works
// even with no ANTHROPIC_API_KEY (e.g. CI / cost-free dry runs).
// ─────────────────────────────────────────────────────────────────────────────
// claudeChat is lazy-imported inside generateWithClaude() so the deterministic /
// no-Claude path never loads the Anthropic SDK (keeps cost-free dry runs light).
import {
  GEO_CLUSTERS, GEO_INTENTS, CLUSTER_IS_NEUTRAL, COMPARISON_CLUSTERS, LOCALIZED_CLUSTERS,
  CLUSTER_DEFAULT_INTENT, CLUSTER_EXPECTED_ANSWER, CLUSTER_WEIGHT, ANSWER_STRUCTURES,
  RUN_MODE_PROMPT_RANGE, RUN_MODE_PRESETS, normalizeRunMode,
} from "./model/constants.js";

// ── small text helpers ───────────────────────────────────────────────────────
const clean = (s) => String(s || "").trim().replace(/\s+/g, " ");
const lc = (s) => clean(s).toLowerCase();
const titleCase = (s) => clean(s).replace(/\b\w/g, (m) => m.toUpperCase());
const wordCount = (s) => clean(s).split(" ").filter(Boolean).length;
const uniq = (a) => [...new Set(a)];

// Normalise a keyword list (strings or {keyword|term|text|name|query}) → strings.
function keywordStrings(keywords = []) {
  return (Array.isArray(keywords) ? keywords : [])
    .map((k) => clean(typeof k === "string" ? k : k?.keyword || k?.term || k?.text || k?.name || k?.query || ""))
    .filter(Boolean);
}
// Keyword objects → {term, volume} (volume drives priority where available).
function keywordObjects(keywords = []) {
  return (Array.isArray(keywords) ? keywords : [])
    .map((k) => {
      if (typeof k === "string") return { term: clean(k), volume: 0 };
      const term = clean(k?.keyword || k?.term || k?.text || k?.name || k?.query || "");
      const volume = Number(k?.global_volume ?? k?.volume ?? k?.search_volume ?? k?.localVolume ?? 0) || 0;
      return term ? { term, volume } : null;
    })
    .filter(Boolean);
}
// Competitor list (strings or {name|domain|brand}) → display names.
function competitorNames(competitors = []) {
  return (Array.isArray(competitors) ? competitors : [])
    .map((c) => {
      const s = typeof c === "string" ? c : c?.name || c?.brand || c?.domain || c?.title || "";
      const m = String(s).match(/^([a-z0-9-]+)\.[a-z0-9.]{2,}$/i); // domain → name
      return clean((m ? m[1] : s).replace(/[-_]+/g, " "));
    })
    .filter(Boolean);
}

// Derive an industry/category phrase from keywords when both are absent.
function indFromKeywords(terms = []) {
  if (!terms.length) return "";
  const STOP = /\b(best|top|near|me|cheap|affordable|price|cost|reviews?|in|the|for|company|companies|services?|agency|agencies|2024|2025|2026|2027)\b/gi;
  const scored = terms
    .map((k) => lc(k.replace(STOP, " ")))
    .map((core) => ({ k: core, n: core.split(" ").filter(Boolean).length }))
    .filter((x) => x.k && x.n >= 1 && x.n <= 4 && !/\d/.test(x.k));
  const pick = scored.find((x) => x.n >= 2 && x.n <= 3) || scored[0];
  return pick ? pick.k : "";
}

// ── Phase 2.5 — flatten the varied Step 3-5 + 5B shapes into clean string lists ──
function textList(v) {
  return (Array.isArray(v) ? v : [])
    .map((x) => clean(typeof x === "string" ? x : x?.text || x?.title || x?.question || x?.query || x?.keyword || x?.action || x?.name || x?.label || x?.term || ""))
    .filter(Boolean);
}
function pageTitleList(v) {
  return (Array.isArray(v) ? v : [])
    .map((x) => clean(typeof x === "string" ? x : x?.page_name || x?.proposed_title || x?.title || x?.keyword_cluster || x?.geo_target || x?.url_slug || x?.name || ""))
    .filter(Boolean);
}
function competitorTopicList(v) {
  const out = [];
  for (const c of (Array.isArray(v) ? v : [])) {
    if (typeof c === "string") { out.push(c); continue; }
    const name = clean(c?.name || c?.brand || c?.domain || "");
    const topics = [...textList(c?.topics), ...textList(c?.what_they_do_well), ...textList(c?.ranking_pages), ...textList(c?.topic_coverage)].slice(0, 4);
    if (name) out.push(topics.length ? `${name}: ${topics.join(", ")}` : name);
  }
  return out;
}
// Loose JSON-OBJECT extractor (the array one above only handles [...]).
function extractJsonObjectLooseLocal(text) {
  const s = String(text || "").trim();
  if (!s) return null;
  const tryP = (str) => { try { const v = JSON.parse(str); return v && typeof v === "object" && !Array.isArray(v) ? v : null; } catch { return null; } };
  let v = tryP(s); if (v) return v;
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/i); if (fenced?.[1]) { v = tryP(fenced[1].trim()); if (v) return v; }
  const noThink = s.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const a = noThink.indexOf("{"), b = noThink.lastIndexOf("}");
  if (a >= 0 && b > a) { v = tryP(noThink.slice(a, b + 1)); if (v) return v; }
  return null;
}

// ── STRICT NEUTRALITY — no brand / company / competitor / domain / website name may
// appear in ANY prompt (we measure ORGANIC AI visibility). Build the forbidden-term set
// from the target brand + domain + ALL competitor names/domains, then drop anything that
// is purely generic category language so we never strip legitimate neutral prompts.
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const GENERIC_NAME_TOKENS = new Set([
  "seo", "digital", "marketing", "agency", "agencies", "service", "services", "web", "website",
  "design", "development", "media", "group", "company", "companies", "solutions", "solution", "tech",
  "technology", "online", "global", "best", "top", "pro", "the", "and", "of", "for", "in", "co", "ltd",
  "inc", "llc", "pvt", "limited", "studio", "studios", "consulting", "consultants", "experts", "expert",
  "creative", "labs", "lab", "hub", "world", "india", "usa", "ai", "data", "cloud", "soft", "systems",
]);
function isDistinctiveName(phrase) {
  const toks = lc(phrase).replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  return toks.some((t) => t.length >= 3 && !GENERIC_NAME_TOKENS.has(t));
}
function buildForbiddenTerms(source = {}, ctx = {}) {
  const terms = new Set();
  const addName = (s) => { const v = clean(s); if (v && v.length >= 3 && isDistinctiveName(v)) terms.add(lc(v)); };
  const addDomain = (d) => {
    const dom = lc(d).replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
    if (!dom || !dom.includes(".")) return;
    terms.add(dom);
    const stem = dom.split(".")[0];
    if (stem && stem.length >= 3 && !GENERIC_NAME_TOKENS.has(stem)) terms.add(stem);
  };
  addName(ctx.brand); addName(source.brand); addName(source.clientName); addName(source.brandName);
  addDomain(source.domain);
  for (const c of [...(source.competitors || source.businessCompetitors || []), ...(source.searchCompetitors || [])]) {
    if (typeof c === "string") { c.includes(".") && !c.includes(" ") ? addDomain(c) : addName(c); }
    else { addName(c?.name); addName(c?.brand); addName(c?.title); addDomain(c?.domain); }
  }
  return terms;
}
function isNeutralClean(text, forbidden) {
  if (!text) return false;
  for (const t of forbidden) {
    if (!t) continue;
    try { if (new RegExp(`\\b${escapeRegex(t)}\\b`, "i").test(text)) return false; }
    catch { if (lc(text).includes(t)) return false; }
  }
  return true;
}

// Tidy a templated prompt: collapse adjacent duplicate words/bigrams ("services
// services" → "services", "seo services seo services" → "seo services") so the
// subject/keyword value injection never reads awkwardly.
function tidyPrompt(s) {
  let p = clean(s);
  p = p.replace(/\b(\w+\s+\w+)\s+\1\b/gi, "$1");   // adjacent duplicate bigram
  p = p.replace(/\b(\w+)(\s+\1\b)+/gi, "$1");        // adjacent duplicate word(s)
  p = p.replace(/\bservices\s+services\b/gi, "services");
  return clean(p);
}

// ── SERP SEEDS — real user questions (People-Also-Ask / related searches / content +
// keyword gaps) become high-value NEUTRAL prompts directly (after the neutrality filter).
function seedsFromSerp(ctx) {
  const out = [];
  const seen = new Set();
  const pool = [...(ctx.serpPaa || []), ...(ctx.serpRelated || []), ...(ctx.serpContentGaps || []), ...(ctx.keywordGaps || [])];
  for (const raw of pool) {
    const q = clean(raw);
    const k = lc(q);
    if (!q || q.length < 8 || q.length > 160 || seen.has(k)) continue;
    seen.add(k);
    let cluster = "Solution aware";
    if (/\b(best|top|which|recommend|leading)\b/.test(k)) cluster = "Best-tool intent";
    else if (/\b(cost|price|pricing|cheap|afford|how much|budget)\b/.test(k)) cluster = "Pricing intent";
    else if (/\b(near me|local)\b/.test(k)) cluster = "Local SEO";
    else if (/\b(how to|how do|guide|tips|ways to)\b/.test(k)) cluster = "Content SEO";
    else if (/\b(why|problem|issue|fix|not working|error)\b/.test(k)) cluster = "Problem aware";
    else if (/\b(vs|versus|compare|comparison|difference|alternatives?)\b/.test(k)) cluster = "Use-case comparison";
    out.push({ prompt: q, cluster, intent: CLUSTER_DEFAULT_INTENT[cluster], neutral: true, source_keyword: "", expected_answer_type: CLUSTER_EXPECTED_ANSWER[cluster], location: null });
  }
  return out.slice(0, 40);
}

// ── location handling (§13) — ONLY real locations, never fabricated ───────────
// Build the list of real locations to vary across, from the location context plus
// any explicit extra locations and "in <Place>" phrases mined from the keywords.
function buildLocations(locationCtx = {}, extra = [], keywordTerms = []) {
  const out = [];
  const add = (label, scope) => { const l = clean(label); if (l) out.push({ label: l, scope }); };
  if (locationCtx.city) add(locationCtx.city, "city");
  if (locationCtx.state) add(locationCtx.state, "state");
  if (locationCtx.country) add(locationCtx.country, "country");
  if (locationCtx.label) add(locationCtx.label, locationCtx.mode || "market");
  for (const e of (Array.isArray(extra) ? extra : [])) add(typeof e === "string" ? e : e?.label, "city");
  // mine "in <Place>" from keywords (conservative: 1–2 capitalised-ish alpha words)
  for (const kw of keywordTerms.slice(0, 60)) {
    const m = String(kw).match(/\bin\s+([a-z][a-z'.-]+(?:\s+[a-z][a-z'.-]+)?)\s*$/i);
    if (m && m[1] && !/\d/.test(m[1])) add(titleCase(m[1]), "city");
  }
  // de-dupe by lowercased label, keep first (most specific) occurrence
  const seen = new Set();
  const dedup = out.filter((x) => { const k = lc(x.label); if (seen.has(k)) return false; seen.add(k); return true; });
  return dedup.length ? dedup : [{ label: "", scope: "market" }];
}
const locLabel = (loc) => (loc && loc.label ? loc.label : "");

// ── cluster quota allocation (§14) ────────────────────────────────────────────
// Distribute `target` across all clusters by weight, with a per-cluster floor and a
// hard cap (≈14% of target) so one topic can never dominate. Always sums to target.
export function allocateQuotas(target, clusters = GEO_CLUSTERS) {
  const n = clusters.length;
  const floor = Math.max(2, Math.round(target * 0.03));
  const cap = Math.max(floor + 1, Math.round(target * 0.14));
  const sumW = clusters.reduce((a, c) => a + (CLUSTER_WEIGHT[c] || 1), 0);
  const q = {};
  let assigned = 0;
  for (const c of clusters) {
    let v = Math.round((target * (CLUSTER_WEIGHT[c] || 1)) / sumW);
    v = Math.min(cap, Math.max(floor, v));
    q[c] = v; assigned += v;
  }
  // reconcile rounding/clamping drift so Σ quota === target
  let drift = target - assigned;
  const order = [...clusters].sort((a, b) => (CLUSTER_WEIGHT[b] || 1) - (CLUSTER_WEIGHT[a] || 1));
  let guard = 0;
  while (drift !== 0 && guard < 10000) {
    for (const c of (drift > 0 ? order : [...order].reverse())) {
      if (drift === 0) break;
      if (drift > 0 && q[c] < cap) { q[c] += 1; drift -= 1; }
      else if (drift < 0 && q[c] > floor) { q[c] -= 1; drift += 1; }
    }
    guard += 1;
    // if every cluster is pinned at a bound, relax the bound to absorb the rest
    if (guard > 50 && drift !== 0) { for (const c of order) { if (drift === 0) break; if (drift > 0) { q[c] += 1; drift -= 1; } else if (q[c] > 1) { q[c] -= 1; drift += 1; } } }
  }
  return q;
}

// ── deterministic data-grounded banks (cover all 14 clusters) ─────────────────
// {x}=subject (category/industry), {loc}=location label, {kw}=a real keyword theme.
function bankFor(cluster) {
  const BANKS = {
    "Technical SEO": [
      "how to improve technical SEO for a {x} website", "technical SEO checklist for {x} sites",
      "how to fix crawl and indexing issues on a {x} website", "core web vitals optimization for {x} businesses",
      "schema markup best practices for {x} websites", "how to run a technical SEO audit for a {x} site",
      "fixing site speed problems on a {x} website", "mobile-first indexing tips for {x} sites",
    ],
    "Content SEO": [
      "best content strategy for ranking a {x} website", "how to write SEO content for {x}",
      "content gap ideas for a {x} blog", "how to do keyword research for {x}",
      "how to build topical authority for a {x} website", "how to rank for {kw}",
      "best blog topics for a {x} business", "on-page SEO checklist for {x} pages",
    ],
    "Local SEO": [
      "best local SEO tips for {x} in {loc}", "how to rank a {x} business in the {loc} map pack",
      "Google Business Profile optimization for {x} in {loc}", "how to get more local reviews for a {x} in {loc}",
      "local citation building for {x} in {loc}", "near me SEO strategy for {x} in {loc}",
      "best local keywords for a {x} in {loc}", "how to rank for {x} near me in {loc}",
    ],
    GEO: [
      "how to get a {x} business cited by AI search engines", "how to improve AI visibility for {x} in {loc}",
      "generative engine optimization tips for {x}", "how to appear in AI Overviews for {x} queries",
      "how to get recommended by ChatGPT for {x} in {loc}", "what makes a {x} brand citable in AI answers",
      "how to optimize {x} content for answer engines", "how do AI engines pick the best {x} in {loc}",
    ],
    "Brand comparison": [
      "{x} brands compared in {loc}", "how to compare {x} providers in {loc}",
      "top {x} brands and how they differ", "which {x} brand is best for small businesses",
      "pros and cons of leading {x} brands in {loc}", "{x} brand reputation comparison in {loc}",
    ],
    "Product comparison": [
      "best {x} solutions compared", "how to compare {x} products in {loc}",
      "which {x} product offers the best features", "{x} feature comparison for businesses",
      "compare {x} options for {kw}", "top {x} products head to head in {loc}",
    ],
    "Use-case comparison": [
      "best {x} for small businesses vs enterprises", "best {x} for startups in {loc}",
      "best {x} for ecommerce businesses", "which {x} is best for lead generation",
      "best {x} for a {kw} use case", "best {x} for agencies in {loc}",
    ],
    "Pricing intent": [
      "{x} pricing and cost in {loc}", "how much does {x} cost in {loc}",
      "most affordable {x} in {loc}", "average price of {x} in {loc}",
      "{x} pricing plans compared", "typical {x} packages and rates in {loc}",
    ],
    "Best-tool intent": [
      "best {x} in {loc}", "top {x} companies in {loc}", "most trusted {x} in {loc}",
      "most recommended {x} in {loc}", "leading {x} in {loc}", "who are the best {x} in {loc}",
    ],
    "Competitor intent": [
      "best alternatives to a typical {x} provider in {loc}", "top {x} competitors in {loc}",
      "{x} alternatives for small businesses", "how to choose between competing {x} providers in {loc}",
      "leading {x} competitors and their strengths", "{x} options similar to the market leaders in {loc}",
    ],
    "Problem aware": [
      "why is my {x} not getting results in {loc}", "common problems with {x} and how to fix them",
      "how to troubleshoot poor {x} performance", "why isn't my {x} working for {kw}",
      "warning signs of a bad {x} provider", "how to fix {kw} issues for a {x} business",
    ],
    "Solution aware": [
      "how can a {x} business solve {kw}", "what is the best way to handle {kw} for {x}",
      "how to choose the right {x} solution in {loc}", "what to look for when hiring a {x} in {loc}",
      "how does a {x} improve results for businesses", "step by step guide to {kw} with a {x}",
    ],
    "Service category": [
      "what does a {x} do for businesses", "types of {x} services explained",
      "what services do {x} providers offer in {loc}", "is {x} worth it for small businesses in {loc}",
      "{kw} as part of {x} services", "full list of {x} services for {loc} businesses",
    ],
    "Location specific": [
      "best {x} in {loc}", "top {x} near me in {loc}", "{x} providers serving {loc}",
      "local {x} experts in {loc}", "{x} for businesses based in {loc}", "trusted {x} in and around {loc}",
    ],
  };
  return BANKS[cluster] || BANKS["Best-tool intent"];
}

// Audience qualifiers used to expand a cluster with genuinely-distinct variants.
const AUDIENCES = ["small businesses", "startups", "ecommerce brands", "enterprises", "agencies", "B2B companies", "D2C brands", "local businesses"];

// Build deterministic, data-grounded records for one cluster up to `want`.
function deterministicForCluster(cluster, want, ctx) {
  const { subject, keywordThemes, comps, locations } = ctx;
  const isLocalized = LOCALIZED_CLUSTERS.includes(cluster);
  const locs = isLocalized ? locations : [locations[0] || { label: "", scope: "market" }];
  const bank = bankFor(cluster);
  const out = [];
  const seen = new Set();
  const push = (raw, loc, kw) => {
    let p = clean(raw).replace(/\{x\}/g, subject).replace(/\{kw\}/g, kw || keywordThemes[0] || subject);
    const label = locLabel(loc);
    p = label ? p.replace(/\{loc\}/g, label) : clean(p.replace(/\s*\bin\s+\{loc\}/gi, "").replace(/\{loc\}/g, "").replace(/\s+near me\b/i, " near me"));
    p = clean(p);
    const k = lc(p);
    if (!p || k.length < 6 || seen.has(k)) return;
    seen.add(k);
    out.push({ prompt: p, cluster, source_keyword: kw || "", location: loc });
  };
  // 1) base bank × locations × keyword themes. Drop themes that just restate the
  //    subject (± location) so {kw} injection adds a DISTINCT angle, not redundancy.
  const subjTok = lc(subject);
  const locTok = locations.map((l) => lc(l.label)).filter(Boolean);
  const themePool = (keywordThemes || []).filter((k) => {
    const lk = lc(k);
    if (!lk || lk === subjTok) return false;
    if (lk.includes(subjTok) && locTok.some((l) => lk.includes(l))) return false; // "seo services bangalore"
    return true;
  });
  const kwPool = themePool.length ? themePool : [subject];
  outer: for (let li = 0; li < locs.length; li++) {
    for (let bi = 0; bi < bank.length; bi++) {
      const kw = kwPool[(bi + li) % kwPool.length];
      push(bank[bi], locs[li], kw);
      if (out.length >= want) break outer;
    }
  }
  // 2) NEUTRAL comparison framing for comparison clusters — NEVER name a brand /
  //    competitor (organic visibility only). Uses category + location language only.
  if (out.length < want && COMPARISON_CLUSTERS.includes(cluster)) {
    const loc = locs[0];
    const neutralComparisons = {
      "Competitor intent": [`best alternatives to the leading ${subject} providers in {loc}`, `top ${subject} providers compared in {loc}`, `how to choose between the top ${subject} providers in {loc}`],
      "Brand comparison": [`how do the top ${subject} brands compare in {loc}`, `most reputable ${subject} brands in {loc}`, `${subject} brands ranked by results in {loc}`],
      "Product comparison": [`best ${subject} solutions compared in {loc}`, `top ${subject} products compared by features`, `${subject} products ranked by value for money`],
      "Use-case comparison": [`best ${subject} for different business sizes in {loc}`, `${subject} compared by use case`, `which type of ${subject} fits which kind of business`],
    };
    for (const t of (neutralComparisons[cluster] || [])) { if (out.length >= want) break; push(t, loc); }
  }
  // 3) audience × keyword expansion to top up to the quota
  for (let a = 0; a < AUDIENCES.length && out.length < want; a++) {
    for (let li = 0; li < locs.length && out.length < want; li++) {
      const kw = kwPool[(a + li) % kwPool.length];
      const loc = locs[li];
      const seg = AUDIENCES[a];
      const tmpl = isLocalized ? `best ${subject} for ${seg} in {loc}` : `best ${subject} for ${seg}`;
      push(tmpl, loc, kw);
    }
  }
  // 4) modifier expansion (noun-phrase clusters only — keeps "how to…" prompts natural)
  //    appends generic, brand-safe query qualifiers for extra UNIQUE variety so big
  //    ("full") runs reach the upper band even from sparse data. No fabricated facts.
  const nounPhrase = isLocalized || COMPARISON_CLUSTERS.includes(cluster);
  if (out.length < want && nounPhrase) {
    const MODS = ["2026", "with proven results", "reviews and ratings", "for small businesses", "with case studies", "for startups", "for agencies", "with good reviews"];
    for (let mi = 0; mi < MODS.length && out.length < want; mi++) {
      for (let li = 0; li < locs.length && out.length < want; li++) {
        for (let ki = 0; ki < kwPool.length && out.length < want; ki++) {
          let p = clean(bank[(mi + ki) % bank.length].replace(/\{x\}/g, subject).replace(/\{kw\}/g, kwPool[ki] || subject));
          const label = locLabel(locs[li]);
          p = label ? p.replace(/\{loc\}/g, label) : clean(p.replace(/\s*\bin\s+\{loc\}/gi, "").replace(/\{loc\}/g, ""));
          push(`${clean(p)} ${MODS[mi]}`, locs[li]);
        }
      }
    }
  }
  return out.slice(0, want);
}

// ── Claude batched generation (grounded, semantic — not hardcoded) ────────────
function chunk(arr, size) { const out = []; for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size)); return out; }

function buildBatchMessages(batchClusters, batchQuota, ctx, askTotal) {
  const { subject, industry, locations, keywordThemes, competitorThemes, comps, topicGaps, homepageTitle, searchIntent } = ctx;
  const lines = batchClusters.map((c) => `  - "${c}" → ~${batchQuota[c]} prompts, intent "${CLUSTER_DEFAULT_INTENT[c]}", neutral=${CLUSTER_IS_NEUTRAL[c]}`).join("\n");
  const sys = `You are a GEO (Generative Engine Optimization) prompt strategist. Generate natural-language prompts that REAL users type into AI search engines (ChatGPT, Google AI Overviews, Perplexity, Gemini, Copilot, Claude) about a business niche.

Return up to ${askTotal} prompts spread across ONLY these clusters:
${lines}

RULES:
1. NEUTRAL clusters (neutral=true) measure ORGANIC visibility — the prompt text MUST NOT contain the client's brand name or any specific competitor brand. Use only the industry/category, location, audience and topic themes.
2. COMPARISON clusters (neutral=false) MAY use competitor brand names and comparison framing ("vs", "alternatives to", "compared to").
3. Each prompt must read like a genuine, specific human query — favour prompts that make AI engines LIST or RECOMMEND named providers/products and CITE sources (so brand mentions + citations are maximised).
4. Ground every prompt in the supplied real data (keywords, competitor keywords, topic gaps, locations, category). Spread across them — never near-duplicates.
5. For localized clusters, write location-specific prompts using the supplied real locations only — do NOT invent places.
6. Set "intent" to one of: ${GEO_INTENTS.join(", ")}. Set "expected_answer_type" to one of: ${ANSWER_STRUCTURES.join(", ")}.
7. GROUND every prompt in the SUPPLIED REAL DATA for THIS specific business. Treat "serp_people_also_ask" and "serp_related_searches" as ACTUAL user questions to base prompts on; directly target the "keyword_gaps", "serp_content_gaps" and "missing_pages"; reflect what "competitor_topics" cover; and use "geo_themes" (commercial / informational / local / competitor / AI-visibility) as the backbone of the set. Prefer these real, business-specific signals over generic phrasings.

Return ONLY valid JSON — an array, no prose, no markdown fences:
[{"prompt":"...","cluster":"<exact cluster name>","intent":"<intent>","neutral":true|false,"source_keyword":"<a real keyword it maps to, or \\"\\">","expected_answer_type":"<type>"}]`;
  const data = {
    industry, category: subject,
    locations: locations.map((l) => l.label).filter(Boolean).slice(0, 6),
    keywords: keywordThemes.slice(0, 40),
    keyword_details: (ctx.keywordDetails || []).slice(0, 20).map((k) => ({ term: k.term, volume: k.volume })),
    keyword_gaps: (ctx.keywordGaps || []).slice(0, 15),
    competitor_keywords: competitorThemes.slice(0, 20),
    competitor_brands: comps.slice(0, 6),
    competitor_topics: (ctx.competitorTopics || []).slice(0, 6),
    topic_gaps: (topicGaps || []).slice(0, 20),
    serp_people_also_ask: (ctx.serpPaa || []).slice(0, 15),
    serp_related_searches: (ctx.serpRelated || []).slice(0, 15),
    serp_content_gaps: (ctx.serpContentGaps || []).slice(0, 15),
    missing_pages: (ctx.missingPages || []).slice(0, 12),
    geo_themes: ctx.themes || null,
    homepage_title: homepageTitle || null,
    search_intent: searchIntent || null,
    clusters: batchClusters,
  };
  return [
    { role: "system", content: sys },
    { role: "user", content: "Generate the clustered prompts for this niche. Use whatever inputs are present, ignore empties:\n" + JSON.stringify(data) },
  ];
}

// Loose JSON-array extractor (tolerates fenced blocks / <think> / prose).
function extractJsonArrayLoose(text) {
  const s = String(text || "").trim();
  if (!s) return null;
  const tryParse = (str) => { try { const v = JSON.parse(str); return Array.isArray(v) ? v : Array.isArray(v?.prompts) ? v.prompts : null; } catch { return null; } };
  let v = tryParse(s); if (v) return v;
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/i); if (fenced?.[1]) { v = tryParse(fenced[1].trim()); if (v) return v; }
  const noThink = s.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const a = noThink.indexOf("["), b = noThink.lastIndexOf("]");
  if (a >= 0 && b > a) { v = tryParse(noThink.slice(a, b + 1)); if (v) return v; }
  return null;
}

function canonCluster(raw) {
  const k = lc(raw); if (!k) return null;
  for (const c of GEO_CLUSTERS) if (lc(c) === k) return c;
  if (/(technical|crawl|index|schema|core web|sitemap|robots|speed)/.test(k)) return "Technical SEO";
  if (/(content|blog|topic|article|on-?page|keyword research)/.test(k)) return "Content SEO";
  if (/(local|map pack|gmb|google business)/.test(k)) return "Local SEO";
  if (/(geo|generative|ai overview|llm|answer engine|aeo|chatgpt)/.test(k)) return "GEO";
  if (/(brand)/.test(k)) return "Brand comparison";
  if (/(product)/.test(k)) return "Product comparison";
  if (/(use ?case|workflow|scenario)/.test(k)) return "Use-case comparison";
  if (/(pric|cost|budget|cheap|afford|plan|rate)/.test(k)) return "Pricing intent";
  if (/(competitor|alternative|vs\.?|versus|rival)/.test(k)) return "Competitor intent";
  if (/(problem|troubleshoot|issue|fix|not working|why)/.test(k)) return "Problem aware";
  if (/(solution|how to|guide|choose|hire)/.test(k)) return "Solution aware";
  if (/(category|service|what does|types of|offer)/.test(k)) return "Service category";
  if (/(near me|location|city|region|area)/.test(k)) return "Location specific";
  if (/(best|top|recommend|leading)/.test(k)) return "Best-tool intent";
  return null;
}

function normalizeClaudeItems(arr, ctx) {
  if (!Array.isArray(arr)) return [];
  const brand = lc(ctx.brand);
  const out = [];
  for (const item of arr) {
    const prompt = clean(typeof item === "string" ? item : item?.prompt);
    if (!prompt || prompt.length < 6 || prompt.length > 240) continue;
    const cluster = canonCluster(typeof item === "object" ? item?.cluster : "") || "Best-tool intent";
    const neutral = typeof item?.neutral === "boolean" ? item.neutral : CLUSTER_IS_NEUTRAL[cluster];
    if (neutral && brand && lc(prompt).includes(brand)) continue; // neutrality guard
    let intent = lc(item?.intent); if (!GEO_INTENTS.includes(intent)) intent = CLUSTER_DEFAULT_INTENT[cluster];
    let eat = lc(item?.expected_answer_type); if (!ANSWER_STRUCTURES.includes(eat)) eat = CLUSTER_EXPECTED_ANSWER[cluster];
    out.push({ prompt, cluster, intent, neutral, source_keyword: clean(item?.source_keyword), expected_answer_type: eat, location: null });
  }
  return out;
}

// ── deep analysis (full mode) — synthesize the FULL dataset into GEO themes ────
// Implements the §"analyze, then generate" step: Opus distils brand/commercial/
// informational/local/competitor topics + keyword/SERP/content/authority gaps + likely
// AI-visibility themes from Steps 3-5 + 5B, which then seed the prompt generation.
// Best-effort: returns null on any failure (generation proceeds with raw signals).
async function analyzeGeoThemes(ctx, domain) {
  try {
    const { claudeChat } = await import("../../claude/client.js");
    const sys = `You analyze a business's full SEO/GEO dataset and distil it into the THEMES an AI-visibility prompt set should target. Return ONLY JSON (no prose):
{"commercial_topics":[],"informational_topics":[],"local_topics":[],"competitor_topics":[],"keyword_opportunities":[],"serp_gaps":[],"content_gaps":[],"authority_gaps":[],"ai_visibility_themes":[]}
Each array: 4-10 short, specific phrases grounded ONLY in the supplied data (no invention). Do not put the client's own brand in neutral themes.`;
    const data = {
      brand: ctx.brand || null, industry: ctx.industry, category: ctx.subject,
      locations: ctx.locations.map((l) => l.label).filter(Boolean).slice(0, 6),
      top_keywords: (ctx.keywordDetails || []).slice(0, 25).map((k) => ({ term: k.term, volume: k.volume })),
      keyword_gaps: ctx.keywordGaps || [], competitor_topics: ctx.competitorTopics || [],
      serp_people_also_ask: ctx.serpPaa || [], serp_related_searches: ctx.serpRelated || [], serp_content_gaps: ctx.serpContentGaps || [],
      missing_pages: ctx.missingPages || [], recommended_pages: ctx.recommendedPages || [], priority_actions: ctx.priorityActions || [],
      authority: ctx.authority || null,
    };
    const { content } = await claudeChat({
      messages: [{ role: "system", content: sys }, { role: "user", content: "Analyze and distil GEO themes from this dataset:\n" + JSON.stringify(data) }],
      model: "claude-opus-4-8", max_tokens: 1500, timeoutMs: 60000,
      meta: { domain, api: "geo-prompt-analysis", label: "geo-themes" },
    });
    const obj = extractJsonObjectLooseLocal(content);
    if (!obj) return null;
    const pick = (a) => textList(a).slice(0, 10);
    const themes = {
      commercial_topics: pick(obj.commercial_topics), informational_topics: pick(obj.informational_topics),
      local_topics: pick(obj.local_topics), competitor_topics: pick(obj.competitor_topics),
      keyword_opportunities: pick(obj.keyword_opportunities), serp_gaps: pick(obj.serp_gaps),
      content_gaps: pick(obj.content_gaps), authority_gaps: pick(obj.authority_gaps),
      ai_visibility_themes: pick(obj.ai_visibility_themes),
    };
    const total = Object.values(themes).reduce((n, a) => n + a.length, 0);
    return total >= 4 ? themes : null;
  } catch (e) {
    try { console.warn("[promptPlanner] analyzeGeoThemes:", e?.message); } catch {}
    return null;
  }
}

async function generateWithClaude(quotas, ctx, domain) {
  const { claudeChat } = await import("../../claude/client.js");
  const clusters = GEO_CLUSTERS.filter((c) => quotas[c] > 0);
  const batches = chunk(clusters, 4);
  const all = [];
  for (const batch of batches) {
    const batchQuota = {}; let sum = 0;
    for (const c of batch) { batchQuota[c] = quotas[c]; sum += quotas[c]; }
    const ask = Math.min(40, sum); // bound per-call output for cost + reliability
    try {
      const { content } = await claudeChat({
        messages: buildBatchMessages(batch, batchQuota, ctx, ask),
        temperature: 0.7, max_tokens: 8000, timeoutMs: 45000,
        meta: { domain, api: "claude-geo-prompts", label: "geo-prompt-planner" },
      });
      const parsed = extractJsonArrayLoose(content);
      all.push(...normalizeClaudeItems(parsed, ctx));
    } catch (e) {
      try { console.warn("[promptPlanner] Claude batch failed:", e?.message); } catch {}
    }
  }
  return all;
}

// ── dedup (§10) — normalized token signature collapses near-duplicates ────────
const SIG_STOP = new Set([
  "a", "an", "the", "in", "for", "of", "to", "and", "or", "is", "are", "my", "me", "near",
  "best", "top", "leading", "most", "popular", "trusted", "recommended", "rated", "good", "great",
  "2024", "2025", "2026", "2027", "how", "what", "who", "which", "do", "does",
]);
export function dedupeSignature(prompt) {
  const toks = lc(prompt).replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((t) => t && !SIG_STOP.has(t) && !/^\d{4}$/.test(t));
  return uniq(toks).sort().join(" ");
}
function dedupe(records) {
  const seen = new Set();
  const out = [];
  for (const r of records) {
    const exact = lc(r.prompt);
    const sig = dedupeSignature(r.prompt);
    if (!exact || seen.has(exact) || seen.has("sig:" + sig)) continue;
    seen.add(exact); seen.add("sig:" + sig);
    out.push({ ...r, dedup_key: sig });
  }
  return out;
}

// ── quality score (§11) 0–100 ─────────────────────────────────────────────────
const INTENT_SIGNAL = /\b(best|top|compare|comparison|vs|versus|alternatives?|cost|price|pricing|cheap|afford|how|which|recommend|near me|review|rank|leading|trusted)\b/i;
const ASK_SIGNAL = /\b(best|top|list|compare|which|recommend|who|leading|alternatives?)\b/i;
export function scoreQuality(rec, ctx) {
  const p = rec.prompt; const w = wordCount(p); let s = 50;
  if (w >= 5 && w <= 26) s += 18; else if (w >= 3) s += 6; else s -= 22;
  if (INTENT_SIGNAL.test(p)) s += 12;
  if (ctx.locations.some((l) => l.label && lc(p).includes(lc(l.label)))) s += 8;
  if (ctx.keywordThemes.some((k) => k && lc(p).includes(lc(k)))) s += 10;
  if (ASK_SIGNAL.test(p)) s += 6;
  if (rec.neutral && ctx.brand && lc(p).includes(lc(ctx.brand))) s = Math.min(s, 8); // neutrality violation
  // redundancy penalty — repeated content words read as awkward templated text
  const words = lc(p).replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((t) => t.length >= 4);
  const counts = {};
  let dup = 0;
  for (const wd of words) { counts[wd] = (counts[wd] || 0) + 1; if (counts[wd] === 2) dup++; }
  if (dup) s -= dup * 9;
  return Math.max(0, Math.min(100, Math.round(s)));
}

// ── priority score (§12) ─────────────────────────────────────────────────────
const INTENT_VALUE = { "best-provider": 14, comparison: 13, competitor: 13, commercial: 12, pricing: 11, transactional: 11, local: 10, informational: 8, troubleshooting: 7 };
function scorePriority(rec, ctx) {
  let p = (rec.quality_score || 0) * 0.5;
  p += (CLUSTER_WEIGHT[rec.cluster] || 1) * 15;
  p += INTENT_VALUE[rec.intent] ?? 8;
  // keyword volume boost: if the prompt references a real keyword, add up to +20
  let volBoost = 0;
  for (const ko of ctx.keywordVol) { if (ko.term && lc(rec.prompt).includes(lc(ko.term))) { volBoost = Math.max(volBoost, Math.min(20, Math.log10(Math.max(10, ko.volume)) * 5)); } }
  p += volBoost;
  return Math.round(p * 100) / 100;
}

// ── per-cluster cap + band trim (§14 + run-mode band) ─────────────────────────
// Two-pass so the mix is balanced BOTH ways: (1) guarantee every cluster is
// represented (coverage) when there's budget, then (2) fill the remainder by global
// priority while no cluster exceeds the cap — so one topic can never dominate AND no
// topic is silently dropped.
function balanceAndTrim(records, target, cap, clusters = GEO_CLUSTERS) {
  const byCluster = new Map();
  for (const r of [...records].sort((a, b) => b.priority_score - a.priority_score)) {
    if (!byCluster.has(r.cluster)) byCluster.set(r.cluster, []);
    byCluster.get(r.cluster).push(r);
  }
  const kept = [];
  const perCount = {};
  // pass 1 — one (the best) per cluster, in canonical cluster order, while budget remains
  for (const c of clusters) {
    if (kept.length >= target) break;
    const list = byCluster.get(c);
    if (list && list.length) { kept.push(list.shift()); perCount[c] = 1; }
  }
  // pass 2 — fill the rest by global priority, respecting the per-cluster cap
  const rest = [...byCluster.values()].flat().sort((a, b) => b.priority_score - a.priority_score);
  for (const r of rest) {
    if (kept.length >= target) break;
    perCount[r.cluster] = perCount[r.cluster] || 0;
    if (perCount[r.cluster] >= cap) continue;
    perCount[r.cluster] += 1;
    kept.push(r);
  }
  return kept.slice(0, target);
}

/**
 * Plan a balanced GEO prompt set for a run mode. PURE — no DB writes, no engine
 * execution, no Browserless.
 *
 * @param {object} opts
 * @param {object} opts.source        normalized project signals (see promptService.normalizeSource)
 * @param {string} opts.runMode       "smoke"|"dev_smoke"|"standard"|"full"|"validation"
 * @param {number} [opts.targetCount] explicit target (overrides the mode band upper bound)
 * @param {boolean}[opts.useClaude]   default true; false forces the deterministic path (no API cost)
 * @returns {Promise<{prompts:Array, distribution:object, target:number, runMode:string, usedClaude:boolean}>}
 *   each prompt: { prompt, cluster, intent, neutral, source_keyword, expected_answer_type,
 *                  quality_score, priority_score, priority, dedup_key, location_context }
 */
export async function planGeoPrompts({ source = {}, runMode = "standard", planMode = "full", targetCount, useClaude = true } = {}) {
  const mode = normalizeRunMode(runMode);
  const band = RUN_MODE_PROMPT_RANGE[mode] || RUN_MODE_PROMPT_RANGE.standard;
  const target = Math.max(1, Math.min(250, Math.round(targetCount || band[1])));
  const minBand = band[0];

  // ── build the grounding context from the FULL dataset (Steps 1-5 + 5B) ──
  const keywordObjs = keywordObjects(source.keywords);
  const keywordThemes = uniq(keywordStrings(source.keywords)).slice(0, 60);
  const competitorThemes = uniq(keywordStrings(source.competitorKeywords)).slice(0, 30);
  const comps = uniq(competitorNames(source.competitors || source.businessCompetitors));
  const industry = lc(source.industry || source.category || indFromKeywords(keywordThemes) || "service providers");
  const subject = lc(source.category || source.industry || indFromKeywords(keywordThemes) || "services");
  const locationCtx = source.locationContext || { mode: source.locationMode || "country", country: source.location || "", label: source.location || "" };
  const locations = buildLocations(locationCtx, source.locations, keywordThemes);
  const serp = source.serp || {};
  const audit = source.audit || {};
  const ctx = {
    brand: clean(source.brand || source.clientName), subject, industry, locations,
    keywordThemes, competitorThemes, comps, keywordVol: keywordObjs,
    topicGaps: (source.topicGaps || []).map(clean).filter(Boolean),
    homepageTitle: clean(source.homepageTitle), searchIntent: clean(source.searchIntent),
    // Phase 2.5 — rich grounding from Steps 3-5 + 5B (planning context only)
    keywordDetails: keywordObjs.slice().sort((a, b) => (b.volume || 0) - (a.volume || 0)).slice(0, 30),
    keywordGaps: uniq(keywordStrings(source.keywordGaps)).slice(0, 20),
    serpPaa: textList(serp.paa).slice(0, 18),
    serpRelated: textList(serp.relatedSearches).slice(0, 18),
    serpContentGaps: textList(serp.contentGaps).slice(0, 18),
    missingPages: pageTitleList(audit.missingPages).slice(0, 14),
    recommendedPages: pageTitleList(audit.recommendedPages).slice(0, 14),
    priorityActions: textList(audit.priorityActions).slice(0, 12),
    competitorTopics: competitorTopicList(source.competitors || source.businessCompetitors).slice(0, 8),
    authority: source.authority || null,
    themes: null,
  };

  // ── STRICT NEUTRALITY — scrub brand/company/competitor/domain names out of every
  //    INJECTABLE VALUE so no name can ever leak into a prompt (organic visibility only).
  //    The templates themselves carry no names; this guards the keyword/SERP values. ──
  const forbidden = buildForbiddenTerms(source, ctx);
  ctx.forbidden = forbidden;
  ctx.keywordThemes = ctx.keywordThemes.filter((k) => isNeutralClean(k, forbidden));
  ctx.keywordDetails = ctx.keywordDetails.filter((k) => isNeutralClean(k.term, forbidden));
  ctx.keywordGaps = ctx.keywordGaps.filter((k) => isNeutralClean(k, forbidden));
  ctx.serpPaa = ctx.serpPaa.filter((q) => isNeutralClean(q, forbidden));
  ctx.serpRelated = ctx.serpRelated.filter((q) => isNeutralClean(q, forbidden));
  ctx.serpContentGaps = ctx.serpContentGaps.filter((q) => isNeutralClean(q, forbidden));
  ctx.competitorTopics = []; // competitor topics are name-bearing → never used in neutral prompts
  if (!ctx.keywordThemes.length) ctx.keywordThemes = [ctx.subject]; // keep a safe injectable value

  // ── deep analysis (full mode) — distil the whole dataset into GEO themes FIRST,
  //    then seed generation from them (§"analyze, then generate") ──
  let analysisUsed = false;
  if (planMode === "full" && useClaude && String(process.env.ANTHROPIC_API_KEY || "").trim()) {
    const themes = await analyzeGeoThemes(ctx, source.domain || "");
    if (themes) { ctx.themes = themes; analysisUsed = true; }
  }

  // ── 1. quotas ──
  const quotas = allocateQuotas(target);

  // ── 2. generation — start with REAL SERP user-questions (neutral seeds from PAA /
  //    related searches / gaps), then fill with TEMPLATE (code) prompts. Claude is
  //    OPTIONAL: with useClaude:false the whole set is token-free (templates + values). ──
  let records = [...seedsFromSerp(ctx)];
  let usedClaude = false;
  if (useClaude && String(process.env.ANTHROPIC_API_KEY || "").trim()) {
    const claudeRecs = await generateWithClaude(quotas, ctx, source.domain || "");
    if (claudeRecs.length) { records.push(...claudeRecs); usedClaude = true; }
  }

  // ── 3. deterministic fill per cluster up to quota ──
  const byCluster = {};
  for (const c of GEO_CLUSTERS) byCluster[c] = [];
  for (const r of records) (byCluster[r.cluster] || byCluster["Best-tool intent"]).push(r);
  for (const c of GEO_CLUSTERS) {
    const have = byCluster[c].length;
    const want = quotas[c];
    if (have < want) {
      const fill = deterministicForCluster(c, (want - have) + 4, ctx).map((r) => ({
        prompt: r.prompt, cluster: c, intent: CLUSTER_DEFAULT_INTENT[c], neutral: CLUSTER_IS_NEUTRAL[c],
        source_keyword: r.source_keyword || "", expected_answer_type: CLUSTER_EXPECTED_ANSWER[c], location: r.location || null,
      }));
      byCluster[c].push(...fill);
    }
  }
  let merged = GEO_CLUSTERS.flatMap((c) => byCluster[c]);

  // ── STRICT NEUTRALITY (final guard) — drop ANY prompt that still contains a brand /
  //    competitor / company / domain / website name. This catches Claude output too. ──
  //    Also tidy templated redundancy ("services services" → "services").
  merged = merged.filter((r) => isNeutralClean(r.prompt, forbidden)).map((r) => ({ ...r, prompt: tidyPrompt(r.prompt) }));

  // ── 4. (location variants already produced inside deterministic + Claude) ──
  // ── 5. dedupe ──
  merged = dedupe(merged);

  // ── 6 + 7. score quality + priority ──
  for (const r of merged) {
    r.quality_score = scoreQuality(r, ctx);
    r.priority_score = 0; // set after quality
  }
  // drop very low quality (keep neutrality-violation drops etc.), but never starve the band
  const QUALITY_FLOOR = 35;
  let scored = merged.filter((r) => r.quality_score >= QUALITY_FLOOR);
  if (scored.length < minBand) scored = merged.sort((a, b) => b.quality_score - a.quality_score).slice(0, Math.max(minBand, target));
  for (const r of scored) r.priority_score = scorePriority(r, ctx);

  // ── 8. balance (per-cluster cap) + trim to target ──
  const cap = Math.max(2, Math.round(target * 0.16));
  let finalRecs = balanceAndTrim(scored, target, cap);
  // if trimming/dedup left us under the band minimum, top up from remaining scored
  if (finalRecs.length < minBand) {
    const have = new Set(finalRecs.map((r) => lc(r.prompt)));
    for (const r of scored.sort((a, b) => b.priority_score - a.priority_score)) {
      if (finalRecs.length >= minBand) break;
      if (!have.has(lc(r.prompt))) { finalRecs.push(r); have.add(lc(r.prompt)); }
    }
  }

  // assign final integer priority (1 = most important), attach location_context, finalize shape
  finalRecs.sort((a, b) => b.priority_score - a.priority_score);
  const prompts = finalRecs.map((r, i) => ({
    prompt: r.prompt,
    cluster: r.cluster,
    intent: r.intent || CLUSTER_DEFAULT_INTENT[r.cluster],
    neutral: true, // strict neutrality enforced — no brand/competitor/domain name in any prompt
    source_keyword: r.source_keyword || "",
    expected_answer_type: r.expected_answer_type || CLUSTER_EXPECTED_ANSWER[r.cluster],
    quality_score: r.quality_score,
    priority_score: r.priority_score,
    priority: i + 1,
    dedup_key: r.dedup_key || dedupeSignature(r.prompt),
    location_context: r.location && r.location.label
      ? { mode: r.location.scope || locationCtx.mode || "city", label: r.location.label, city: r.location.scope === "city" ? r.location.label : (locationCtx.city || ""), state: locationCtx.state || "", country: locationCtx.country || "" }
      : { mode: locationCtx.mode || "country", label: locationCtx.label || locationCtx.country || "", city: locationCtx.city || "", state: locationCtx.state || "", country: locationCtx.country || "" },
  }));

  // distribution summary
  const distribution = { by_cluster: {}, by_intent: {} };
  for (const c of GEO_CLUSTERS) distribution.by_cluster[c] = 0;
  for (const it of GEO_INTENTS) distribution.by_intent[it] = 0;
  for (const p of prompts) { distribution.by_cluster[p.cluster] = (distribution.by_cluster[p.cluster] || 0) + 1; distribution.by_intent[p.intent] = (distribution.by_intent[p.intent] || 0) + 1; }

  return { prompts, distribution, target, runMode: mode, planMode, usedClaude, analysisUsed };
}

export default planGeoPrompts;
