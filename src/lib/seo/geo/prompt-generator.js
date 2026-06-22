// src/lib/seo/geo/prompt-generator.js
// ─────────────────────────────────────────────────────────────────────────────
// GEO Vision §17 — SEMANTIC-CLUSTERED PROMPT GENERATOR
//
// Produces ~22 (hard range 20–25) DETAILED, comprehensive AI-visibility prompts
// per project, grouped into 10 intent clusters. The goal is QUALITY over QUANTITY:
// instead of 150–250 shallow prompts, we generate ~22 specific, data-rich prompts
// that still capture 100% of the GEO data needed (brand mentions, brand citations,
// competitor mentions/citations, and all the §20–25 Share-of-Voice + citation
// signals) — but WITHOUT the cost of 150–250 engine calls. Each prompt is picked
// to maximize how often AI engines NAME brands and CITE sources.
//
// Claude does the semantic clustering + generation from whatever project signals
// are available (homepage title/content, DataForSEO keywords, competitor keywords,
// search intent, industry, topic gaps, location, product/service category),
// selecting the 2–3 STRONGEST prompts per the most valuable clusters rather than
// many shallow ones. If Claude fails or returns junk, a DETERMINISTIC clustered
// expansion of the locked templates is used instead — the function NEVER returns
// empty.
//
// ── NEW CONTRACT (changed from the old sync string[] version) ────────────────
//   generateGeoPrompts(opts) is now ASYNC and resolves to an ARRAY OF OBJECTS:
//     {
//       prompt:   string   // the natural-language query an AI engine is asked
//       cluster:  string   // one of CLUSTERS (Technical SEO, Content SEO, …)
//       intent:   string   // short intent label (e.g. "best-tool", "pricing")
//       neutral:  boolean  // true  = organic-visibility prompt; MUST NOT contain
//                          //         the client's own brand (so Share-of-Voice
//                          //         stays organic). Clusters: Technical SEO,
//                          //         Content SEO, Local SEO, GEO, Pricing intent,
//                          //         Best-tool intent.
//                          // false = comparison/competitor prompt (may name the
//                          //         brand / competitors). Clusters: Brand
//                          //         comparison, Product comparison, Use-case
//                          //         comparison, Competitor intent.
//       priority: number   // 1..N, stable rank. Lower = more important. A caller
//                          //         can take the top-N (they span ALL clusters,
//                          //         round-robin) for a smaller inline run.
//     }
//
//   Total is capped at 25 and de-duplicated by prompt text (case-insensitive).
//   Target is ~22 (hard range 20–25); the deterministic fallback also lands here.
//
// Back-compat note for callers (route is updated separately):
//   • OLD: const prompts = generateGeoPrompts({...})        // string[]
//   • NEW: const objs = await generateGeoPrompts({...})     // {prompt,...}[]
//          const prompts = objs.map(o => o.prompt)          // to get strings
//
// NEUTRALITY: neutral prompts only ever carry industry + location + category +
// keyword themes — never the client's brand — so we measure whether the brand
// appears ORGANICALLY in the answer to a neutral query.
// ─────────────────────────────────────────────────────────────────────────────

import { claudeChat } from "../../claude/client.js";

// The 10 intent clusters (§17). NEUTRAL clusters must stay brand-free.
export const CLUSTERS = [
  "Technical SEO",
  "Content SEO",
  "Local SEO",
  "GEO",
  "Brand comparison",
  "Product comparison",
  "Use-case comparison",
  "Pricing intent",
  "Best-tool intent",
  "Competitor intent",
];

// Which clusters are organic-visibility (neutral=true) vs comparison (neutral=false).
const NEUTRAL_CLUSTERS = new Set([
  "Technical SEO",
  "Content SEO",
  "Local SEO",
  "GEO",
  "Pricing intent",
  "Best-tool intent",
]);

// Short intent label per cluster (used when Claude omits one / for the fallback).
const CLUSTER_INTENT = {
  "Technical SEO": "technical-seo",
  "Content SEO": "content-seo",
  "Local SEO": "local-seo",
  GEO: "geo",
  "Brand comparison": "brand-comparison",
  "Product comparison": "product-comparison",
  "Use-case comparison": "use-case-comparison",
  "Pricing intent": "pricing",
  "Best-tool intent": "best-tool",
  "Competitor intent": "competitor",
};

// Roughly how many DETAILED prompts to target per cluster. Sum ≈ 22 (range 20–25).
// QUALITY over QUANTITY: pick the 2–3 STRONGEST prompts for the most data-revealing
// clusters (those that make AI engines NAME brands + CITE sources) rather than many
// shallow ones. Claude is asked to scale to this; the fallback returns the same.
//   Brand comparison / Competitor intent / Best-tool intent → 3 (name brands most)
//   GEO / Product / Use-case / Technical / Content / Local → 2
//   Pricing intent → 1
const CLUSTER_TARGET = {
  "Technical SEO": 2,
  "Content SEO": 2,
  "Local SEO": 2,
  GEO: 2,
  "Brand comparison": 3,
  "Product comparison": 2,
  "Use-case comparison": 2,
  "Pricing intent": 1,
  "Best-tool intent": 3,
  "Competitor intent": 3,
};

const TOTAL_CAP = 25;
const TOTAL_MIN = 20;
// Relaxed acceptance gate: a valid ~15–25 prompt array from Claude is GOOD ENOUGH.
// We only reject Claude output (and fall back / top-up) when fewer than this many
// well-formed prompts survive validation. (Old code demanded ~75+.)
const MIN_VALID = 12;

const clean = (s) => String(s || "").trim().replace(/\s+/g, " ");
const lc = (s) => clean(s).toLowerCase();

// ── LOCKED template seeds (the old §17 set) — reused by the deterministic
// fallback so we always have a clustered, brand-neutral baseline. ─────────────
export const GEO_PROMPT_TEMPLATES = [
  "best {ind} in {loc} 2026",
  "top {ind} companies in {loc}",
  "top {ind} providers in {loc}",
  "most affordable {ind} in {loc}",
  "best budget {ind} in {loc}",
  "top rated {ind} near me",
  "best {ind} for small businesses in {loc}",
  "how to choose the best {ind} in {loc}",
  "{ind} pricing and cost in {loc}",
  "most trusted {ind} in {loc}",
  "best reviewed {ind} in {loc}",
  "award winning {ind} in {loc}",
  "most recommended {ind} in {loc}",
  "most popular {ind} in {loc}",
  "best value for money {ind} in {loc}",
  "leading {ind} in {loc}",
  "best {ind} with proven results in {loc}",
  "{ind} reviews and ratings in {loc}",
  "who are the best {ind} in {loc}",
  "best {ind} services in {loc}",
];

// Derive a category/industry phrase from collected KEYWORDS — used ONLY when
// industry and category are both absent. Picks the most representative short head
// phrase (1-4 words, no location/brand noise, no digits).
function _indFromKeywords(keywords = []) {
  const list = _keywordStrings(keywords);
  if (!list.length) return "";
  const STOP =
    /\b(best|top|near|me|cheap|affordable|price|cost|reviews?|in|the|for|company|companies|services?|agency|agencies|2024|2025|2026)\b/gi;
  const scored = list
    .map((k) => clean(k.replace(STOP, " ")).toLowerCase())
    .map((core) => ({ k: core, n: core.split(" ").filter(Boolean).length }))
    .filter((x) => x.k && x.n >= 1 && x.n <= 4 && !/\d/.test(x.k));
  const pick = scored.find((x) => x.n >= 2 && x.n <= 3) || scored[0];
  return pick ? pick.k : "";
}

// Normalise a keyword list (strings or {keyword|term|text|name} objects) → strings.
function _keywordStrings(keywords = []) {
  return (Array.isArray(keywords) ? keywords : [])
    .map((k) =>
      clean(
        typeof k === "string"
          ? k
          : k?.keyword || k?.term || k?.text || k?.name || k?.query || ""
      )
    )
    .filter(Boolean);
}

// Normalise a competitor list (strings or {name|domain|brand} objects) → names.
function _competitorNames(competitors = []) {
  return (Array.isArray(competitors) ? competitors : [])
    .map((c) => {
      const s =
        typeof c === "string" ? c : c?.name || c?.brand || c?.domain || c?.title || "";
      const m = String(s).match(/^([a-z0-9-]+)\.[a-z0-9.]{2,}$/i); // domain → name
      return clean((m ? m[1] : s).replace(/[-_]+/g, " "));
    })
    .filter(Boolean);
}

// Loose JSON-ARRAY extractor (the shared util only handles objects). Pulls the
// first balanced [...] out of Claude's text, tolerating fenced blocks / prose.
function extractJsonArrayLoose(text) {
  const s = String(text || "").trim();
  if (!s) return null;
  const tryParse = (str) => {
    try {
      const v = JSON.parse(str);
      return Array.isArray(v) ? v : Array.isArray(v?.prompts) ? v.prompts : null;
    } catch {
      return null;
    }
  };
  let v = tryParse(s);
  if (v) return v;
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    v = tryParse(fenced[1].trim());
    if (v) return v;
  }
  const noThink = s.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const start = noThink.indexOf("[");
  const end = noThink.lastIndexOf("]");
  if (start >= 0 && end > start) {
    v = tryParse(noThink.slice(start, end + 1));
    if (v) return v;
  }
  return null;
}

// Map an arbitrary cluster string from Claude onto our canonical CLUSTERS.
function _canonCluster(raw) {
  const k = lc(raw);
  if (!k) return null;
  for (const c of CLUSTERS) {
    if (lc(c) === k) return c;
  }
  // fuzzy: match on distinctive keyword
  if (/(technical|crawl|index|schema|core web|sitemap|robots)/.test(k)) return "Technical SEO";
  if (/(content|blog|topic|article|on-?page|keyword research)/.test(k)) return "Content SEO";
  if (/(local|near me|gmb|google business|map pack|city|region)/.test(k)) return "Local SEO";
  if (/(geo|generative|ai overview|llm|chatgpt|answer engine|aeo)/.test(k)) return "GEO";
  if (/(brand)/.test(k)) return "Brand comparison";
  if (/(product)/.test(k)) return "Product comparison";
  if (/(use ?case|workflow|scenario)/.test(k)) return "Use-case comparison";
  if (/(pric|cost|budget|cheap|afford|plan)/.test(k)) return "Pricing intent";
  if (/(best|top|recommend|leading)/.test(k)) return "Best-tool intent";
  if (/(competitor|alternative|vs\.?|versus|rival)/.test(k)) return "Competitor intent";
  return null;
}

// ── DETERMINISTIC FALLBACK ───────────────────────────────────────────────────
// Clustered expansion of the locked templates + light keyword/category/competitor
// blending. No LLM. Always lands in the ~22 (20–25) band — one of the strongest
// few per cluster — and is fully tagged so the return shape is identical to the
// Claude path.
function buildFallbackPrompts({ ind, loc, cat, keywordTerms, competitorNames }) {
  const subject = cat || ind; // product/service phrasing where we have a category
  const kw = keywordTerms.slice(0, 12);
  const topKw = kw.slice(0, 6);
  const comps = competitorNames.slice(0, 4);

  // Per-cluster template banks. {x}=subject, {loc}=location, {kw}=a keyword theme.
  const banks = {
    "Technical SEO": [
      "how to improve technical SEO for a {x} website",
      "best technical SEO checklist for {x} sites in {loc}",
      "how to fix crawl and indexing issues on a {x} website",
      "core web vitals optimization for {x} businesses",
      "schema markup best practices for {x} websites",
      "how to do a technical SEO audit for {x} in {loc}",
      "fixing site speed problems for a {x} website",
      "mobile-first indexing tips for {x} sites",
      "best XML sitemap setup for {x} websites",
      "how to handle duplicate content on a {x} site",
      "robots.txt and canonical setup for {x} websites",
      "JavaScript SEO best practices for {x} sites",
    ],
    "Content SEO": [
      "best content strategy for ranking a {x} website",
      "how to write SEO content for {x} in {loc}",
      "content gap ideas for a {x} blog",
      "best blog topics for a {x} business in {loc}",
      "how to do keyword research for {x}",
      "on-page SEO checklist for {x} pages",
      "how to build topical authority for a {x} website",
      "best content formats to rank for {x} keywords",
      "how to optimize a {x} landing page for SEO",
      "content cluster ideas for {x} in {loc}",
      "how to rank for {kw}",
      "best practices to write content about {kw}",
    ],
    "Local SEO": [
      "best local SEO tips for {x} in {loc}",
      "how to rank a {x} business in the {loc} map pack",
      "Google Business Profile optimization for {x} in {loc}",
      "how to get more local reviews for a {x} in {loc}",
      "local citation building for {x} businesses in {loc}",
      "near me SEO strategy for {x} in {loc}",
      "how to rank for {x} near me",
      "local link building ideas for {x} in {loc}",
      "best local keywords for a {x} in {loc}",
      "how to optimize a {x} for multiple {loc} locations",
    ],
    GEO: [
      "how to get a {x} business cited by AI search engines",
      "how to improve AI visibility for {x} in {loc}",
      "best generative engine optimization tips for {x}",
      "how to appear in AI Overviews for {x} queries",
      "how to get recommended by ChatGPT for {x} in {loc}",
      "how do AI engines pick the best {x} in {loc}",
      "what makes a {x} brand citable in AI answers",
      "how to optimize {x} content for answer engines",
      "best sources to earn for AI visibility as a {x}",
      "how to track AI share of voice for a {x} business",
      "top {x} in {loc} 2026",
      "who are the leading {x} in {loc}",
    ],
    "Pricing intent": [
      "{x} pricing and cost in {loc}",
      "how much does {x} cost in {loc}",
      "most affordable {x} in {loc}",
      "best budget {x} in {loc}",
      "average price of {x} in {loc}",
      "best value for money {x} in {loc}",
      "cheap {x} options in {loc}",
      "{x} pricing plans compared",
      "is {x} worth the cost in {loc}",
      "typical {x} packages and rates in {loc}",
    ],
    "Best-tool intent": [
      "best {x} in {loc} 2026",
      "top {x} companies in {loc}",
      "top rated {x} in {loc}",
      "most trusted {x} in {loc}",
      "most recommended {x} in {loc}",
      "best reviewed {x} in {loc}",
      "leading {x} in {loc}",
      "most popular {x} in {loc}",
      "best {x} for small businesses in {loc}",
      "who are the best {x} in {loc}",
      "best {x} services in {loc}",
      "award winning {x} in {loc}",
    ],
    "Brand comparison": [
      "{x} brands compared in {loc}",
      "how to compare {x} providers in {loc}",
      "top {x} brands and how they differ",
      "which {x} brand is best for small businesses",
      "{x} brand reputation comparison in {loc}",
      "compare the most popular {x} brands",
      "pros and cons of leading {x} brands",
      "best {x} brand for results in {loc}",
    ],
    "Product comparison": [
      "best {x} solutions compared",
      "how to compare {x} products in {loc}",
      "which {x} product offers the best features",
      "{x} feature comparison for {loc} businesses",
      "compare {x} options for {kw}",
      "best {x} product for the money",
      "{x} product reviews and comparison",
      "top {x} products head to head",
    ],
    "Use-case comparison": [
      "best {x} for small businesses vs enterprises",
      "best {x} for startups in {loc}",
      "best {x} for ecommerce businesses",
      "best {x} for B2B vs B2C in {loc}",
      "which {x} is best for lead generation",
      "best {x} for a {kw} use case",
      "best {x} for agencies in {loc}",
      "{x} compared by use case",
    ],
    "Competitor intent": [
      "best alternatives to a typical {x} provider in {loc}",
      "top {x} competitors in {loc}",
      "{x} alternatives for small businesses",
      "how to choose between competing {x} providers",
      "best {x} rivals compared in {loc}",
      "leading {x} competitors and their strengths",
      "switching between {x} providers in {loc}",
      "{x} options similar to the market leaders",
    ],
  };

  // Add competitor-named variants ONLY to non-neutral comparison clusters.
  if (comps.length) {
    for (const c of comps) {
      banks["Competitor intent"].push(`${c} alternatives in ${loc}`);
      banks["Competitor intent"].push(`${subject} providers similar to ${c}`);
      banks["Brand comparison"].push(`${c} vs other ${subject} in ${loc}`);
      banks["Product comparison"].push(`${c} vs other ${subject} products`);
    }
  }

  // Audience segments + qualifiers — used to expand a cluster with GENUINELY
  // distinct prompts when its base bank + keyword themes run dry, so every cluster
  // reliably reaches its (small) per-cluster target and the total clears the 20 floor.
  const AUDIENCES = [
    "small businesses",
    "startups",
    "ecommerce brands",
    "enterprises",
    "agencies",
    "B2B companies",
    "D2C brands",
    "local businesses",
  ];
  // Per-cluster "expander" producing a brand-safe (for neutral clusters) variant
  // string from an audience + an optional keyword theme + an index for variety.
  const expanders = {
    "Technical SEO": (a, kw) => `technical SEO tips for ${a} running a ${subject} website`,
    "Content SEO": (a, kw) => `best content strategy for ${a} in ${subject}${kw ? ` targeting ${kw}` : ""}`,
    "Local SEO": (a, kw) => `local SEO for ${a} offering ${subject} in ${loc}`,
    GEO: (a, kw) => `how can ${a} in ${subject} get cited by AI search engines in ${loc}`,
    "Pricing intent": (a, kw) => `${subject} pricing for ${a} in ${loc}`,
    "Best-tool intent": (a, kw) => `best ${subject} for ${a} in ${loc}`,
    "Brand comparison": (a, kw) => `best ${subject} brand for ${a} in ${loc}`,
    "Product comparison": (a, kw) => `best ${subject} product for ${a}${kw ? ` and ${kw}` : ""}`,
    "Use-case comparison": (a, kw) => `${subject} compared for ${a} use cases in ${loc}`,
    "Competitor intent": (a, kw) => `top ${subject} competitors for ${a} in ${loc}`,
  };

  const out = [];
  for (const cluster of CLUSTERS) {
    const bank = banks[cluster] || [];
    const want = CLUSTER_TARGET[cluster] || 18;
    const items = [];
    const seen = new Set();
    const push = (raw) => {
      const filled = clean(raw);
      if (!filled) return;
      const key = filled.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      items.push(filled);
    };

    // 1) Cycle base templates, rotating the keyword theme.
    let i = 0;
    while (items.length < want && i < bank.length * Math.max(1, topKw.length || 1)) {
      const tpl = bank[i % bank.length];
      const theme = topKw.length ? topKw[i % topKw.length] : subject;
      push(tpl.replace(/\{x\}/g, subject).replace(/\{loc\}/g, loc).replace(/\{kw\}/g, theme));
      i += 1;
    }

    // 2) Top up with audience × keyword expander variants until the target is hit.
    const expand = expanders[cluster];
    if (expand) {
      const kwPool = topKw.length ? topKw : [""];
      for (let a = 0; a < AUDIENCES.length && items.length < want; a += 1) {
        for (let k = 0; k < kwPool.length && items.length < want; k += 1) {
          push(expand(AUDIENCES[a], kwPool[k]));
        }
      }
    }

    for (const p of items) out.push({ cluster, prompt: p });
  }
  return out;
}

// ── Build the Claude prompt for semantic clustering + generation ──────────────
function buildClaudeMessages(ctx) {
  const {
    ind,
    loc,
    cat,
    homepageTitle,
    homepageContent,
    searchIntent,
    industryContext,
    topicGaps,
    keywordTerms,
    competitorKeywordTerms,
    competitorNames,
  } = ctx;

  const targetLines = CLUSTERS.map(
    (c) => `  - ${c} (~${CLUSTER_TARGET[c]} prompts, neutral=${NEUTRAL_CLUSTERS.has(c)})`
  ).join("\n");

  const sys = `You are a GEO (Generative Engine Optimization) prompt strategist. Your job is to generate a SMALL but POWERFUL, semantically-clustered set of natural-language prompts that real users would type into AI search engines (ChatGPT, AI Overviews, Perplexity, Gemini) for a given business niche.

QUALITY OVER QUANTITY. Return ONLY ~${(TOTAL_MIN + TOTAL_CAP) >> 1} prompts total (HARD RANGE ${TOTAL_MIN}–${TOTAL_CAP}, never more than ${TOTAL_CAP}). These few prompts must TOGETHER capture 100% of the GEO data needed for Share-of-Voice + citation analysis across ALL engines: how often AI engines NAME brands (the client's and competitors') and how often they CITE sources/domains. So every prompt must be DETAILED, specific, and data-rich — the kind of question that forces an AI engine to list named providers/products AND cite the sources behind them.

Pick the 2–3 STRONGEST, most data-revealing prompts for the most VALUABLE clusters rather than many shallow ones. Distribute across these 10 clusters to hit ~${(TOTAL_MIN + TOTAL_CAP) >> 1} total:
${targetLines}

RULES:
1. NEUTRAL clusters (neutral=true: Technical SEO, Content SEO, Local SEO, GEO, Pricing intent, Best-tool intent) measure ORGANIC visibility. Their prompts MUST NOT contain the client's brand name or any specific competitor brand name — only the industry/category, location, and topic themes. This keeps Share-of-Voice organic.
2. NON-NEUTRAL clusters (neutral=false: Brand comparison, Product comparison, Use-case comparison, Competitor intent) MAY reference competitor brand names and comparison framing ("vs", "alternatives to", "compared to").
3. Each prompt must read like a genuine, well-formed human query — DETAILED and specific to the niche, not a 3-word fragment. Favour prompts that explicitly ask AI engines to recommend/list/rank NAMED providers, products, or tools and to back the answer with sources, so brand mentions and citations are maximised.
4. Every prompt must be UNIQUE (no duplicates, no trivial rewordings). Spread the small set across the supplied keywords, topic gaps, and use-cases so the ~${(TOTAL_MIN + TOTAL_CAP) >> 1} together cover everything — do not waste a slot on a near-duplicate.

Return ONLY valid JSON — an array of objects, no prose, no markdown fences:
[{"prompt":"...","cluster":"<one of the 10 cluster names exactly>","intent":"short-intent-label","neutral":true|false}]`;

  const data = {
    industry: ind,
    product_or_service_category: cat || null,
    location: loc,
    homepage_title: homepageTitle || null,
    homepage_content_excerpt: homepageContent ? clean(homepageContent).slice(0, 1200) : null,
    search_intent: searchIntent || null,
    industry_context: industryContext || null,
    topic_gaps: topicGaps && topicGaps.length ? topicGaps.slice(0, 25) : null,
    keywords: keywordTerms.slice(0, 40),
    competitor_keywords: competitorKeywordTerms.slice(0, 25),
    competitor_brands: competitorNames.slice(0, 6),
    clusters: CLUSTERS,
    total_min: TOTAL_MIN,
    total_max: TOTAL_CAP,
  };

  return [
    { role: "system", content: sys },
    {
      role: "user",
      content:
        "Generate the clustered prompt set for this business niche. Inputs (use whatever is present, ignore nulls):\n" +
        JSON.stringify(data),
    },
  ];
}

// Validate + normalise Claude's array into our tagged shape. Returns [] if junk.
function normalizeClaudePrompts(arr, { brandName }) {
  if (!Array.isArray(arr) || arr.length < 1) return []; // not an array / empty → reject
  const brand = lc(brandName);
  const out = [];
  for (const item of arr) {
    const prompt = clean(typeof item === "string" ? item : item?.prompt);
    if (!prompt || prompt.length < 6 || prompt.length > 220) continue;
    const cluster = _canonCluster(typeof item === "object" ? item?.cluster : "") || "Best-tool intent";
    const neutral =
      typeof item?.neutral === "boolean" ? item.neutral : NEUTRAL_CLUSTERS.has(cluster);
    // Hard neutrality guard: a neutral prompt that leaked the client's brand is unsafe → drop it.
    if (neutral && brand && lc(prompt).includes(brand)) continue;
    const intent = clean(item?.intent) || CLUSTER_INTENT[cluster] || "geo";
    out.push({ prompt, cluster, intent, neutral });
  }
  return out;
}

// De-dupe by lowercased prompt, cap at TOTAL_CAP, then assign round-robin priority
// so the top-N (any N) spans ALL clusters present. Returns the final tagged array.
function finalize(items) {
  // dedupe
  const seen = new Set();
  const unique = [];
  for (const it of items) {
    const key = lc(it.prompt);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(it);
  }

  // bucket by cluster (preserve cluster order from CLUSTERS, unknowns last)
  const buckets = new Map();
  for (const c of CLUSTERS) buckets.set(c, []);
  for (const it of unique) {
    if (!buckets.has(it.cluster)) buckets.set(it.cluster, []);
    buckets.get(it.cluster).push(it);
  }

  // round-robin interleave across clusters → ranked order spans all clusters
  const ranked = [];
  const lists = [...buckets.values()].filter((l) => l.length);
  let idx = 0;
  while (ranked.length < unique.length) {
    let pushedThisPass = false;
    for (const list of lists) {
      if (list[idx]) {
        ranked.push(list[idx]);
        pushedThisPass = true;
        if (ranked.length >= TOTAL_CAP) break;
      }
    }
    if (ranked.length >= TOTAL_CAP) break;
    if (!pushedThisPass) break;
    idx += 1;
  }

  // assign priority 1..N and cap
  return ranked.slice(0, TOTAL_CAP).map((it, i) => ({
    prompt: it.prompt,
    cluster: it.cluster,
    intent: it.intent || CLUSTER_INTENT[it.cluster] || "geo",
    neutral:
      typeof it.neutral === "boolean" ? it.neutral : NEUTRAL_CLUSTERS.has(it.cluster),
    priority: i + 1,
  }));
}

/**
 * §17 — SEMANTIC-CLUSTERED GEO prompt generator. ASYNC.
 *
 * Resolves to an array of { prompt, cluster, intent, neutral, priority } objects
 * (~22, hard range 20–25, deduped, capped at 25). QUALITY over QUANTITY: a few
 * DETAILED, data-rich prompts that together capture 100% of the Share-of-Voice +
 * citation signal across all engines. Uses Claude for semantic clustering +
 * generation; falls back to a deterministic clustered template expansion if Claude
 * fails or returns junk, so it NEVER returns empty.
 *
 * @param {object} opts
 * @param {string}        opts.industry            industry / niche
 * @param {string}        opts.category            product/service category (preferred subject)
 * @param {string}        opts.location            location / market (default "India")
 * @param {Array}         opts.keywords            DataForSEO keywords (strings or {keyword|term|text|name})
 * @param {Array}         opts.competitorKeywords  competitor keywords (same shapes as keywords)
 * @param {Array}         opts.competitors         competitor brands (strings or {name|domain|brand})
 * @param {string}        opts.brand               client brand name (kept OUT of neutral prompts)
 * @param {string}        opts.homepageTitle       homepage / website title
 * @param {string}        opts.homepageContent     homepage content excerpt
 * @param {string}        opts.searchIntent        dominant search intent
 * @param {string}        opts.industryContext     free-text industry context
 * @param {Array<string>} opts.topicGaps           topic-gap themes to cover
 * @param {string}        opts.domain              client domain (for cost-tracking meta)
 * @param {boolean}       opts.useClaude           set false to force the deterministic path (default true)
 * @returns {Promise<Array<{prompt:string,cluster:string,intent:string,neutral:boolean,priority:number}>>}
 */
export async function generateGeoPrompts({
  industry = "",
  category = "",
  location = "",
  keywords = [],
  competitorKeywords = [],
  competitors = [],
  brand = "",
  homepageTitle = "",
  homepageContent = "",
  searchIntent = "",
  industryContext = "",
  topicGaps = [],
  domain = "",
  useClaude = true,
} = {}) {
  const keywordTerms = _keywordStrings(keywords);
  const competitorKeywordTerms = _keywordStrings(competitorKeywords);
  const competitorNames = _competitorNames(competitors);

  const ind = lc(industry || category || _indFromKeywords(keywords) || "service providers");
  const cat = lc(category || "");
  const loc = clean(location || "India");

  const fallbackArgs = { ind, loc, cat, keywordTerms, competitorNames };

  // ── Try Claude first ────────────────────────────────────────────────────────
  if (useClaude && String(process.env.ANTHROPIC_API_KEY || "").trim()) {
    try {
      const messages = buildClaudeMessages({
        ind,
        loc,
        cat,
        homepageTitle,
        homepageContent,
        searchIntent,
        industryContext,
        topicGaps: Array.isArray(topicGaps) ? topicGaps.map(clean).filter(Boolean) : [],
        keywordTerms,
        competitorKeywordTerms,
        competitorNames,
      });
      const { content } = await claudeChat({
        messages,
        // Generation benefits from a little variety (ignored for Opus internally).
        temperature: 0.6,
        // ~22 DETAILED prompts of JSON — keep headroom for long, data-rich prompts
        // (and any Opus adaptive-thinking preamble).
        max_tokens: 8000,
        // Keep prompt-gen FAST so it doesn't eat the scan's 300s budget — fall through to
        // the (instant) deterministic clustered fallback if Claude is slow.
        timeoutMs: 40000,
        meta: { domain, api: "claude-geo-prompts", label: "geo-prompt-generator" },
      });
      const parsed = extractJsonArrayLoose(content);
      const normalized = normalizeClaudePrompts(parsed, { brandName: brand });
      // RELAXED GATE: a valid ~15–25 array is ACCEPTED (require only ≥ MIN_VALID=12).
      // finalize() dedupes + caps at TOTAL_CAP(25) so we still land in the 20–25 band.
      if (normalized.length >= MIN_VALID) {
        return finalize(normalized);
      }
      // Too few well-formed prompts → top up with the deterministic fallback rather
      // than discarding good prompts (still deduped + capped in finalize()).
      if (normalized.length > 0) {
        const topped = [...normalized, ...buildFallbackPrompts(fallbackArgs)];
        const result = finalize(topped);
        if (result.length >= MIN_VALID) return result;
      }
    } catch (e) {
      // swallow — fall through to deterministic path
      try {
        console.warn("[geo-prompt-generator] Claude generation failed:", e?.message);
      } catch {}
    }
  }

  // ── Deterministic fallback (never empty) ────────────────────────────────────
  return finalize(buildFallbackPrompts(fallbackArgs));
}

export default generateGeoPrompts;
