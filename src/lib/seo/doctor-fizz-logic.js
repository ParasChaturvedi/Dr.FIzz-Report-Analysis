// src/lib/seo/doctor-fizz-logic.js
// ═══════════════════════════════════════════════════════════════════════════════
// DOCTOR FIZZ — STAGE 3 BUSINESS LOGIC LAYER
// ═══════════════════════════════════════════════════════════════════════════════
// This module implements the deterministic classification, filtering, and
// validation rules from the Doctor Fizz Universal Report Framework (Parts 1-2).
//
// It runs AFTER raw data collection (Stage 1) and normalization (Stage 2), and
// BEFORE Claude narrative generation (Stage 4). Nothing reaches Claude without
// passing through this layer.
//
// The output is the canonical structured JSON object defined in Part 2 of the
// spec — fully classified keywords, separated content architecture, categorized
// backlinks, GBP comparison, validated KPIs, and labeled missing data.
//
// Implements fixes for:
//   Problem 1 — Keyword intent classification (5-class decision tree)
//   Problem 2 — Competitor brand keyword exclusion
//   Problem 3 — Blog/service page differentiation
//   Problem 4 — Backlink type categorization (4 categories)
//   Problem 5 — GBP competitor comparison
//   Problem 6 — KPI directional validation
//   Problem 7 — Missing data labeling
// ═══════════════════════════════════════════════════════════════════════════════

// ── Missing data labels (Problem 7) ───────────────────────────────────────────
export const MISSING_LABELS = {
  EMPTY:          "Not available from current data sources. Manual verification recommended.",
  ERROR:          "Data temporarily unavailable. Will populate on next report refresh.",
  NOT_APPLICABLE: "Not applicable for this report scope.",
};

/**
 * Resolve a raw field value into either the value or an appropriate missing-data
 * label. Never returns null, empty string, or a dash. (Problem 7)
 *
 * @param {*} value      The raw value from a data source
 * @param {object} opts  { status: "empty"|"error"|"na", isZeroValid: bool }
 * @returns {{ value: *, available: bool, label: string|null }}
 */
export function resolveField(value, opts = {}) {
  const { status = "empty", isZeroValid = false } = opts;

  const isMissing =
    value == null ||
    value === "" ||
    value === "—" ||
    value === "-" ||
    (typeof value === "string" && value.trim().toLowerCase() === "n/a") ||
    (value === 0 && !isZeroValid);

  if (isMissing) {
    const label =
      status === "error" ? MISSING_LABELS.ERROR :
      status === "na"    ? MISSING_LABELS.NOT_APPLICABLE :
                           MISSING_LABELS.EMPTY;
    return { value: null, available: false, label };
  }
  return { value, available: true, label: null };
}

// ═══════════════════════════════════════════════════════════════════════════════
// KEYWORD INTENT CLASSIFICATION (Problem 1 — 5-class decision tree)
// ═══════════════════════════════════════════════════════════════════════════════

// Signal vocabularies for each intent class.
const TRANSACTIONAL_SIGNALS = [
  "agency", "service", "services", "company", "companies", "provider", "providers",
  "software", "platform", "tool", "pricing", "price", "cost", "quote", "hire",
  "buy", "purchase", "order", "book", "booking", "demo", "consultation", "consultant",
  "for small business", "for small businesses", "for startups", "vendor", "supplier",
  "near me", "subscription", "package", "plan", "solution", "solutions", "outsource",
];

const INFORMATIONAL_SIGNALS = [
  "what is", "what are", "how to", "how do", "how can", "why", "when", "who",
  "guide", "checklist", "tips", "examples", "example", "best practices", "tutorial",
  "learn", "explained", "explain", "definition", "meaning", "ideas", "ultimate guide",
  "step by step", "vs", "versus", "difference between", "comparison", "compare",
  "benefits of", "types of", "list of", "ways to",
];

const LOCATION_SIGNALS = [
  "in", "near", "nearby", "around", "local", "city", "area", "region", "district",
];

// Common Indian + global cities/regions to detect geo-modifiers (extensible).
const KNOWN_LOCATIONS = [
  "mumbai", "delhi", "bangalore", "bengaluru", "hyderabad", "chennai", "kolkata",
  "pune", "ahmedabad", "jaipur", "surat", "lucknow", "kanpur", "nagpur", "indore",
  "noida", "gurgaon", "gurugram", "chandigarh", "kochi", "coimbatore", "vizag",
  "bhopal", "patna", "vadodara", "ghaziabad", "ludhiana", "agra", "nashik", "faridabad",
  "new york", "london", "dubai", "singapore", "toronto", "sydney", "los angeles",
  "chicago", "san francisco", "boston", "seattle", "austin", "miami", "dallas",
];

// Regions/states + countries — so local demand can resolve to the NARROWEST
// appropriate geography scope (city → region → country), per V3 Part 7.3.
const KNOWN_REGIONS = [
  "maharashtra", "karnataka", "tamil nadu", "telangana", "kerala", "gujarat", "rajasthan",
  "uttar pradesh", "madhya pradesh", "west bengal", "punjab", "haryana", "bihar", "odisha",
  "andhra pradesh", "assam", "jharkhand", "chhattisgarh", "uttarakhand", "goa", "delhi ncr", "ncr",
  "california", "texas", "florida", "new york state", "ontario", "england", "scotland",
];
const KNOWN_COUNTRIES = [
  "india", "usa", "united states", "uk", "united kingdom", "uae", "canada", "australia",
  "singapore", "germany", "france", "saudi arabia", "south africa",
];

/**
 * Step 1 of the decision tree: does the keyword contain a competitor brand name?
 */
function matchesCompetitorBrand(keyword, competitorBrands) {
  const k = String(keyword).toLowerCase();
  for (const brand of competitorBrands) {
    const b = String(brand).toLowerCase().trim();
    if (!b || b.length < 2) continue;
    // Match whole brand or significant brand tokens (length ≥ 4 to avoid noise)
    if (k.includes(b)) return brand;
    const tokens = b.split(/[\s.\-/]+/).filter(t => t.length >= 4);
    for (const t of tokens) {
      if (new RegExp(`\\b${escapeRegex(t)}\\b`).test(k)) return brand;
    }
  }
  return null;
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Step 2: is the keyword topically related to the client's products/services?
 * Uses the client's own keyword/service vocabulary as the relevance anchor.
 */
function isTopicallyRelevant(keyword, relevanceTerms) {
  if (!relevanceTerms.length) return true; // no anchor → don't over-filter
  const k = String(keyword).toLowerCase();
  for (const term of relevanceTerms) {
    const t = String(term).toLowerCase().trim();
    if (!t) continue;
    const tokens = t.split(/\s+/).filter(w => w.length >= 4);
    for (const tok of tokens) {
      if (k.includes(tok)) return true;
    }
    if (k.includes(t)) return true;
  }
  return false;
}

/**
 * Step 3: does the keyword combine a location modifier with a commercial term?
 */
function hasLocationModifier(keyword) {
  const k = String(keyword).toLowerCase();
  // Known city / region / country name present? (V3 Part 7.3 — any geo scope)
  for (const loc of [...KNOWN_LOCATIONS, ...KNOWN_REGIONS, ...KNOWN_COUNTRIES]) {
    if (new RegExp(`\\b${escapeRegex(loc)}\\b`).test(k)) return true;
  }
  // "X in <place>" or "near me" pattern with a commercial term present
  if (/\bnear me\b/.test(k)) return true;
  return false;
}

function hasCommercialTerm(keyword) {
  const k = String(keyword).toLowerCase();
  return TRANSACTIONAL_SIGNALS.some(sig => k.includes(sig));
}

/**
 * Step 4: does the keyword indicate buying/hiring/vendor-selection intent?
 */
function hasTransactionalIntent(keyword) {
  const k = String(keyword).toLowerCase();
  return TRANSACTIONAL_SIGNALS.some(sig => k.includes(sig));
}

/**
 * Step 5: does the keyword indicate learning/comparison/research intent?
 */
function hasInformationalIntent(keyword) {
  const k = String(keyword).toLowerCase();
  return INFORMATIONAL_SIGNALS.some(sig => k.includes(sig));
}

/**
 * Recommended asset type for an accepted keyword, derived from its intent class.
 * (Problem 3 — every keyword maps to a specific asset type)
 */
function assetTypeForIntent(intentClass, keyword, volume) {
  const k = String(keyword).toLowerCase();
  switch (intentClass) {
    case "transactional":
      // High-volume commercial heads → Landing Page; specific service → Service Page
      if (/pricing|cost|quote|demo|free|trial|buy|book/.test(k)) return "Landing Page";
      return "Service Page";
    case "local-commercial":
      // V3 Part 7.3 — narrowest geography scope, not always "city".
      return extractGeography(keyword).page_type || "City Page";
    case "informational":
      if (/faq|question|\?$/.test(k)) return "FAQ Expansion";
      // Broad head terms → Pillar Guide; "best/list/resources" → Resource Hub; else Blog Post
      if (/ultimate guide|complete guide|everything about|^what is/.test(k) || (volume && volume > 5000)) return "Pillar Guide";
      if (/best|top \d|list of|resources|tools|examples/.test(k)) return "Resource Hub";
      return "Blog Post";
    default:
      return "Blog Post";
  }
}

/**
 * Funnel role for an accepted keyword. (Problem 3)
 */
function funnelRoleForIntent(intentClass) {
  switch (intentClass) {
    case "transactional":    return "Conversion";
    case "local-commercial": return "Conversion";
    case "informational":    return "Awareness";
    case "commercial":       return "Consideration";
    default:                 return "Awareness";
  }
}

/**
 * THE CLASSIFICATION DECISION TREE (Problem 1, exact spec implementation).
 * Returns one of:
 *   transactional | informational | local-commercial | navigational |
 *   competitor-branded | exclude
 *
 * @param {object} kw                { keyword, volume, difficulty, position, intent, url }
 * @param {object} ctx              { competitorBrands[], relevanceTerms[], clientBrand }
 * @returns {object} classified keyword with intent_class, recommended_asset_type, funnel_role, reason
 */
export function classifyKeyword(kw, ctx = {}) {
  const keyword = String(kw.keyword || "");
  const { competitorBrands = [], relevanceTerms = [], clientBrand = "", negativeExclusions = [] } = ctx;

  const base = {
    keyword,
    global_volume:      kw.volume ?? null,
    local_volume:       kw.localVolume ?? kw.volume ?? null,
    keyword_difficulty: kw.difficulty != null ? Math.round((kw.difficulty <= 1 ? kw.difficulty * 100 : kw.difficulty)) : null,
    position:           kw.position ?? null,
    url:                kw.url ?? null,
  };

  // ── Step 0: user-specified negative / exclude term (V3 Part 3.4)? → exclude ──
  const kwLC = keyword.toLowerCase();
  for (const neg of negativeExclusions) {
    const n = String(neg).toLowerCase().trim();
    if (n && n.length >= 2 && kwLC.includes(n)) {
      return {
        ...base,
        intent_class:          "exclude",
        recommended_asset_type: null,
        funnel_role:           null,
        reason:                `Matches a user-specified negative/exclude term ("${neg}"). Suppressed from the report.`,
      };
    }
  }

  // ── Step 1: Competitor brand? → competitor-branded (monitor only) ──
  const matchedBrand = matchesCompetitorBrand(keyword, competitorBrands);
  if (matchedBrand) {
    return {
      ...base,
      intent_class:          "competitor-branded",
      recommended_asset_type: null,
      funnel_role:           null,
      reason:                `Contains competitor brand "${matchedBrand}". Routed to brand monitoring — never a content target.`,
    };
  }

  // ── Step 2: Topically relevant? → if not, exclude ──
  const clientBrandLC = String(clientBrand).toLowerCase().trim();
  const isClientBrand = clientBrandLC && keyword.toLowerCase().includes(clientBrandLC);
  if (!isClientBrand && !isTopicallyRelevant(keyword, relevanceTerms)) {
    return {
      ...base,
      intent_class:          "exclude",
      recommended_asset_type: null,
      funnel_role:           null,
      reason:                "Topically irrelevant to the client's products or services. No plausible conversion path regardless of volume.",
    };
  }

  // ── Navigational: client's own brand term → monitor ──
  if (isClientBrand) {
    return {
      ...base,
      intent_class:          "navigational",
      recommended_asset_type: null,
      funnel_role:           "Retention",
      reason:                "Branded query for the client. Monitor for brand-awareness share; no new content required.",
    };
  }

  // ── Step 3: Location modifier + commercial term? → local-commercial ──
  if (hasLocationModifier(keyword) && hasCommercialTerm(keyword)) {
    const geo = extractGeography(keyword);
    return {
      ...base,
      intent_class:          "local-commercial",
      recommended_asset_type: geo.page_type || "City Page",
      funnel_role:           "Conversion",
      reason:                `Geo-modifier combined with a commercial term. Maps to a ${(geo.page_type || "geography page").toLowerCase()} at the ${geo.scope} level, not a generic service page.`,
    };
  }

  // ── Step 4: Transactional intent? → transactional ──
  if (hasTransactionalIntent(keyword)) {
    return {
      ...base,
      intent_class:          "transactional",
      recommended_asset_type: assetTypeForIntent("transactional", keyword, base.global_volume),
      funnel_role:           "Conversion",
      reason:                "Buying/hiring/vendor-selection intent. Maps to a service or landing page — never a blog post.",
    };
  }

  // ── Step 5: Informational intent? → informational ──
  if (hasInformationalIntent(keyword)) {
    return {
      ...base,
      intent_class:          "informational",
      recommended_asset_type: assetTypeForIntent("informational", keyword, base.global_volume),
      funnel_role:           "Awareness",
      reason:                "Learning/comparison/research intent. Maps to a blog post or guide that feeds the commercial funnel.",
    };
  }

  // ── Default: navigational/ambiguous → manual review ──
  return {
    ...base,
    intent_class:          "navigational",
    recommended_asset_type: null,
    funnel_role:           null,
    reason:                "Ambiguous intent. Routed to manual review before any content decision.",
  };
}

/**
 * Run the full keyword classification pass over a raw keyword list.
 * Returns the keywords object from the Part 2 schema:
 *   { accepted[], brand_monitoring_only[], excluded[] }
 *
 * (Problems 1, 2 — classification + competitor exclusion)
 */
export function classifyKeywords(rawKeywords, ctx = {}) {
  const accepted = [];
  const brand_monitoring_only = [];
  const excluded = [];
  const seen = new Set();

  for (const kw of rawKeywords || []) {
    if (!kw || typeof kw !== "object") continue; // skip null/malformed entries
    const keyword = String(kw.keyword || "").trim().toLowerCase();
    if (!keyword || seen.has(keyword)) continue; // dedupe
    seen.add(keyword);

    const classified = classifyKeyword(kw, ctx);

    switch (classified.intent_class) {
      case "competitor-branded":
        brand_monitoring_only.push({
          keyword: classified.keyword,
          volume:  classified.global_volume,
          reason:  classified.reason,
        });
        break;
      case "exclude":
        excluded.push({
          keyword: classified.keyword,
          reason:  classified.reason,
        });
        break;
      case "navigational":
        // Branded client term = monitoring; ambiguous = excluded from content but logged
        brand_monitoring_only.push({
          keyword: classified.keyword,
          volume:  classified.global_volume,
          reason:  classified.reason,
        });
        break;
      default:
        // transactional, informational, local-commercial → accepted with priority
        accepted.push({
          ...classified,
          priority: computeKeywordPriority(classified),
        });
    }
  }

  // Sort accepted by priority (HIGH → MEDIUM → LOW), then by opportunity
  const rank = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  accepted.sort((a, b) =>
    (rank[a.priority] - rank[b.priority]) ||
    ((b.global_volume || 0) / Math.max(1, b.keyword_difficulty || 50)) -
    ((a.global_volume || 0) / Math.max(1, a.keyword_difficulty || 50))
  );

  return { accepted, brand_monitoring_only, excluded };
}

/**
 * Priority for an accepted keyword: high volume + low difficulty = HIGH.
 */
function computeKeywordPriority(k) {
  const vol  = k.global_volume || 0;
  const diff = k.keyword_difficulty != null ? k.keyword_difficulty : 50;
  const score = vol / Math.max(1, diff);
  // Transactional/local-commercial get a priority bump (closer to revenue)
  const commercialBump = (k.intent_class === "transactional" || k.intent_class === "local-commercial") ? 1.5 : 1;
  const adjusted = score * commercialBump;
  if (adjusted >= 40 || (vol >= 1000 && diff <= 40)) return "HIGH";
  if (adjusted >= 10 || vol >= 300) return "MEDIUM";
  return "LOW";
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTENT ARCHITECTURE SEPARATION (Problem 3)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Map accepted keywords into the three separated content sections.
 * Commercial pages, blog content, and city pages NEVER merge.
 * Schema additions are routed to the GEO layer, not here.
 *
 * @param {Array} accepted  accepted keywords from classifyKeywords
 * @returns {object} content_architecture per Part 2 schema
 */
export function buildContentArchitecture(accepted = []) {
  const commercial_pages = [];
  const blog_and_guides  = [];
  const geography_pages  = [];

  const slugify = (s) => String(s).toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 60);

  for (const k of accepted) {
    // V3 Part 10.1 — geography relevance where applicable (the geo scope for local
    // demand; "Not geo-specific" for commercial/informational pages).
    const geoRel = k.intent_class === "local-commercial"
      ? (extractGeography(k.keyword).place || "Local")
      : "Not geo-specific";
    const fundamentals = {
      keyword_cluster:     k.keyword,
      primary_volume:      k.global_volume,
      intent_class:        k.intent_class,
      asset_type:          k.recommended_asset_type,
      funnel_role:         k.funnel_role,
      priority:            k.priority,
      geography_relevance: geoRel,
    };

    if (k.intent_class === "transactional") {
      commercial_pages.push({
        ...fundamentals,
        page_name:        toTitle(k.keyword),
        url_slug:         "/" + slugify(k.keyword),
        commercial_reason: `Captures "${k.keyword}" buyers with conversion intent — a blog cannot convert this query.`,
      });
    } else if (k.intent_class === "local-commercial") {
      // V3 Part 7.3 — map to the NARROWEST geography scope (city/region/country),
      // not a hardcoded city page.
      const geo = extractGeography(k.keyword);
      geography_pages.push({
        ...fundamentals,
        page_name:        toTitle(k.keyword),
        geo_scope:        geo.scope,            // city | region | country
        geo_target:       geo.place,
        page_type:        geo.page_type,        // City Page | Region Page | Country Page
        city_target:      geo.scope === "city" ? geo.place : "",  // backward-compat
        url_slug:         "/" + slugify(k.keyword),
        why_separate_page: `Local intent demands its own destination — a generic service page modifier will not rank for "${k.keyword}".`,
      });
    } else if (k.intent_class === "informational") {
      blog_and_guides.push({
        ...fundamentals,
        proposed_title:   toTitle(k.keyword),
        search_intent:    "Informational — researcher in the awareness stage",
        funnel_connection: "Feeds the commercial funnel by capturing top-of-funnel demand and internally linking to the matching service page.",
      });
    }
  }

  return {
    commercial_pages,
    blog_and_guides,
    geography_pages,                 // V3 Part 7.3 — parent category (city/region/country)
    city_pages: geography_pages,     // backward-compatible alias for existing consumers
    schema_additions: [], // populated by the GEO layer, kept separate per spec
  };
}

function toTitle(s) {
  return String(s).replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Resolve the geography of a local keyword to the narrowest matching scope.
 * @returns {{ place: string, scope: "city"|"region"|"country", page_type: string }}
 */
function extractGeography(keyword) {
  const k = String(keyword).toLowerCase();
  for (const loc of KNOWN_LOCATIONS) {                       // city (most specific)
    if (new RegExp(`\\b${escapeRegex(loc)}\\b`).test(k)) return { place: toTitle(loc), scope: "city", page_type: "City Page" };
  }
  for (const reg of KNOWN_REGIONS) {                         // region / state
    if (new RegExp(`\\b${escapeRegex(reg)}\\b`).test(k)) return { place: toTitle(reg), scope: "region", page_type: "Region Page" };
  }
  for (const country of KNOWN_COUNTRIES) {                   // country
    if (new RegExp(`\\b${escapeRegex(country)}\\b`).test(k)) return { place: toTitle(country), scope: "country", page_type: "Country Page" };
  }
  return { place: "", scope: "city", page_type: "Geography Page" };
}
// Backward-compatible city extractor (city scope only).
function extractCity(keyword) {
  const g = extractGeography(keyword);
  return g.scope === "city" ? g.place : "";
}

// ═══════════════════════════════════════════════════════════════════════════════
// BACKLINK CATEGORIZATION (Problem 4 — 4 categories, never merged)
// ═══════════════════════════════════════════════════════════════════════════════

// Recognised citation/directory platforms (extensible).
const CITATION_PLATFORMS = [
  { name: "JustDial",      site: "justdial.com",   dr: 80, signal: "Local + India directory authority" },
  { name: "Sulekha",       site: "sulekha.com",    dr: 75, signal: "Local services directory" },
  { name: "IndiaMART",     site: "indiamart.com",  dr: 82, signal: "B2B listing + local trust" },
  { name: "TradeIndia",    site: "tradeindia.com", dr: 72, signal: "B2B listing" },
  { name: "Google Maps",   site: "google.com/maps",dr: 100,signal: "Local Pack + NAP consistency" },
  { name: "Yelp",          site: "yelp.com",       dr: 92, signal: "Review aggregator authority" },
  { name: "Trustpilot",    site: "trustpilot.com", dr: 91, signal: "Review trust signal" },
  { name: "Yellow Pages",  site: "yellowpages.in", dr: 70, signal: "General business directory" },
  { name: "Facebook",      site: "facebook.com",   dr: 100,signal: "Social + NAP citation" },
  { name: "Glassdoor",     site: "glassdoor.com",  dr: 90, signal: "Employer authority signal" },
  { name: "Clutch",        site: "clutch.co",      dr: 89, signal: "B2B agency review platform" },
  { name: "GoodFirms",     site: "goodfirms.co",   dr: 80, signal: "B2B services directory" },
];

/**
 * Categorize all backlink/citation opportunities into the four spec categories.
 * Each opportunity lands in exactly one category.
 *
 * @param {object} input {
 *   directories: [{name, site, listed, listingUrl}],  // from GMB route
 *   competitorBacklinks: [{domain_from, competitor, link_type}],  // gap targets
 *   industry: string,
 *   location: string,
 * }
 * @returns {object} backlinks per Part 2 schema
 */
export function categorizeBacklinks(input = {}) {
  const { directories = [], competitorBacklinks = [], industry = "", location = "India", competitorDirectories = [] } = input;

  // For each platform, count how many competitors are already listed there
  // (Problem 4: citation entries must show "whether competitors are listed").
  const platformMatch = (dirList, p) => (dirList || []).find(d =>
    String(d.site || "").includes(p.site.split("/")[0]) ||
    String(d.name || "").toLowerCase() === p.name.toLowerCase()
  );

  // ── Category 1: Citation and directory links ──
  const citation_links = CITATION_PLATFORMS.map(p => {
    const match = platformMatch(directories, p);
    // competitorDirectories: [{ name, directories: [...] }]
    const competitorsListed = (competitorDirectories || []).filter(c => {
      const m = platformMatch(c.directories, p);
      return m && m.listed === true;
    }).map(c => c.name);
    const totalComps = (competitorDirectories || []).length;
    return {
      platform:           p.name,
      domain_rating:      p.dr,
      client_listed:      match ? match.listed === true : false,
      competitors_listed: competitorsListed.length,          // count of rivals present
      competitors_total:  totalComps,
      competitor_names:   competitorsListed.slice(0, 3),
      listing_url:        match?.listingUrl || null,
      effort_hours:       "≈1 hour",
      signal:             p.signal,
      category:           "citation",
    };
  });

  // ── Category 3: Competitor link gap ──
  const competitor_gap = (competitorBacklinks || []).slice(0, 15).map(b => ({
    referring_domain:  b.domain_from || b.domain || b.referring_domain || "",
    links_to:          b.competitor || b.links_to || "competitor",
    link_type:         b.link_type || (b.dofollow === false ? "nofollow mention" : "editorial link"),
    domain_rating:     b.rank ?? b.domain_rating ?? null,
    approach:          `The source already links to ${b.competitor || "a competitor"} — pitch equivalent value (data, quote, or resource) to earn the same link.`,
    category:          "competitor_gap",
  }));

  // ── Category 2: Editorial and content-earned links (template opportunities) ──
  const editorial_links = buildEditorialOpportunities(industry);

  // ── Category 4: Local authority links ──
  const local_authority_links = buildLocalAuthorityOpportunities(location, industry);

  return { citation_links, editorial_links, competitor_gap, local_authority_links };
}

function buildEditorialOpportunities(industry) {
  const ind = industry || "your industry";
  return [
    {
      content_asset: `Original ${ind} benchmark study or annual data report`,
      target_source: "Trade publications and industry newsletters",
      effort:        "≈2–3 weeks",
      link_type:     "Editorial / data citation",
      why_unique:    "Original first-party data cannot be replicated by competitors without running their own study.",
      category:      "editorial",
    },
    {
      content_asset: `Interactive calculator or free tool relevant to ${ind}`,
      target_source: "Resource roundups and ‘best tools’ list articles",
      effort:        "≈2–4 weeks",
      link_type:     "Resource mention",
      why_unique:    "A genuinely useful tool earns passive links over time and is expensive for rivals to copy.",
      category:      "editorial",
    },
    {
      content_asset: "Expert commentary / founder quote via HARO-style platforms",
      target_source: "Journalists sourcing expert quotes",
      effort:        "≈3–5 hours/week ongoing",
      link_type:     "Editorial feature",
      why_unique:    "Tied to named expertise — strengthens E-E-A-T alongside the link.",
      category:      "editorial",
    },
    {
      content_asset: "Client case study with measurable results",
      target_source: "Partner sites and B2B publications",
      effort:        "≈1 week per study",
      link_type:     "Case study placement",
      why_unique:    "Proprietary results are unique to the client's engagements.",
      category:      "editorial",
    },
  ];
}

function buildLocalAuthorityOpportunities(location, industry) {
  const loc = location || "your region";
  return [
    { source: `${loc} chamber of commerce`,        link_type: "Membership listing",  local_signal: "Geographic authority + NAP",      effort: "≈2 hours",  category: "local_authority" },
    { source: `Regional ${loc} news / media`,       link_type: "Editorial mention",   local_signal: "Local relevance + freshness",     effort: "≈1 week",   category: "local_authority" },
    { source: "Local event or community sponsorship",link_type: "Sponsor link",        local_signal: "Community trust signal",          effort: "≈3 hours",  category: "local_authority" },
    { source: `${loc} business association`,         link_type: "Directory listing",   local_signal: "Industry + geographic signal",    effort: "≈1 hour",   category: "local_authority" },
  ];
}

// ═══════════════════════════════════════════════════════════════════════════════
// GBP COMPETITOR COMPARISON (Problem 5)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build the GBP comparison object: client vs every competitor across the 13 fields,
 * plus biggest gap, fastest win, and trust gap analysis.
 *
 * @param {object} clientGmb        the client's gmbCheck result
 * @param {Array}  competitorGmbs   [{ domain, gmbCheck }]
 * @returns {object} gbp_comparison per Part 2 schema
 */
export function buildGbpComparison(clientGmb, competitorGmbs = []) {
  const toRow = (label, gmb) => {
    const info = gmb?.gmb || {};
    return {
      name:               label,
      verified:           !!info.isVerified,
      primary_category:   info.category || null,
      secondary_categories: info.secondaryCategories?.length ?? (info.additionalCategories?.length ?? 0),
      review_count:       info.reviewCount ?? gmb?.reviewCount ?? 0,
      rating:             info.rating ?? null,
      review_recency:     gmb?.reviewVelocity != null ? `${gmb.reviewVelocity}/mo` : (gmb?.lastReviewDate || null),
      post_frequency:     info.postFrequency ?? null,
      photos:             info.photoCount ?? (info.hasPhotos ? "present" : 0),
      services_populated: info.servicesPopulated ?? null,
      qa_active:          (gmb?.qa || []).length > 0,
      qa_answered:        (gmb?.qa || []).filter(q => q.hasAnswer).length,
      hours_complete:     !!info.hoursAvailable,
      website_link:       !!(info.website || info.url),
      booking_link:       !!info.bookingUrl,
      description_complete: !!info.description,
      completeness:       gmb?.completeness?.score ?? null,
    };
  };

  const client = toRow("Your Business", clientGmb);
  const competitors = (competitorGmbs || [])
    .filter(c => c?.gmbCheck)
    .map(c => toRow(c.name || c.domain || "Competitor", c.gmbCheck));

  const analysis = computeGbpGaps(client, competitors);
  // Detailed per-competitor breakdown (the dedicated "Competitor Analysis").
  const competitor_analysis = competitors.map(c => analyseCompetitorGbp(client, c));
  // Per-FIELD analysis: who's best, who's missing it, and how the client improves.
  const field_analysis = buildGbpFieldAnalysis(client, competitors);
  // Review intelligence (sentiment, velocity, unreplied, distribution) from the
  // client's live GMB — surfaces the data the GMB collector already computes.
  const review_intel = buildReviewIntel(clientGmb, competitors);
  // Prioritised GBP action plan (V1 spec: action list with effort) as four-beat
  // actions derived from the field gaps, ranked by impact-to-effort.
  const gbp_action_plan = buildGbpActionPlan(field_analysis, client, competitors);
  // "What Good Looks Like" — the expected local outcome after the work.
  const what_good_looks_like = buildLocalOutcome(client, competitors, gbp_action_plan);

  return {
    client,
    competitors,
    competitor_analysis,
    field_analysis,
    review_intel,
    gbp_action_plan,
    what_good_looks_like,
    biggest_gap:  analysis.biggestGap,
    fastest_win:  analysis.fastestWin,
    trust_gap:    analysis.trustGap,
    has_competitor_data: competitors.length > 0,
  };
}

// Review intelligence from the client's live GMB result (sentiment, velocity,
// unreplied count, rating distribution) + a benchmark vs the strongest rival.
function buildReviewIntel(clientGmb, competitors) {
  if (!clientGmb) return null;
  const s = clientGmb.sentiment || null;
  const dist = clientGmb.ratingDistribution || null;
  const velocity = clientGmb.reviewVelocity ?? null;
  const unreplied = clientGmb.unrepliedReviewCount ?? null;
  const totalReviews = clientGmb.gmb?.reviewCount ?? clientGmb.reviewCount ?? 0;
  const compBestReviews = Math.max(0, ...competitors.map(c => c.review_count || 0));
  if (!s && dist == null && velocity == null && unreplied == null) return null;
  return {
    total_reviews: totalReviews,
    competitor_best_reviews: compBestReviews,
    review_gap: compBestReviews > totalReviews ? compBestReviews - totalReviews : 0,
    velocity_per_month: velocity,
    unreplied_count: unreplied,
    rating_distribution: dist,
    sentiment: s ? {
      overall: s.overallSentiment, score: s.sentimentScore,
      praises: s.topPraises || [], complaints: s.topComplaints || [],
      urgent: s.urgentIssues || [],
    } : null,
    // Commercial interpretation (V2 Rule 14)
    commercial_reading: compBestReviews > totalReviews
      ? `When a customer compares profiles side by side, ${compBestReviews} reviews reads as established and safe while ${totalReviews} reads as unproven — review volume is the single biggest factor in who they call.`
      : `${totalReviews} reviews is a credible base of social proof; the focus now is freshness and response rate.`,
  };
}

// Prioritised GBP action plan from the field gaps (four-beat, effort-tagged).
function buildGbpActionPlan(fieldAnalysis, client, competitors) {
  const effortFor = (field) => ({
    verified: "≈15 min", website_link: "≈5 min", booking_link: "≈10 min", hours_complete: "≈10 min",
    primary_category: "≈10 min", secondary_categories: "≈10 min", description_complete: "≈30 min",
    photos: "≈30 min", services_populated: "≈45 min", qa_active: "≈30 min",
    review_count: "≈6–8 weeks", rating: "ongoing", review_recency: "ongoing", post_frequency: "≈15 min/wk", completeness: "≈1 hour",
  }[field] || "≈30 min");
  const priorityFor = (field) => /verified|review_count|completeness/.test(field) ? "HIGH" : /photos|description|hours|website/.test(field) ? "QUICK WIN" : "MEDIUM";

  const actions = (fieldAnalysis || [])
    .filter(f => f.client_status !== "best" && f.improvement)
    .map(f => ({
      area: f.label,
      action: f.improvement,
      outcome: outcomeFor(f.field, client, competitors),
      priority: priorityFor(f.field),
      effort: effortFor(f.field),
      _impact: f.client_status === "missing" ? 3 : 2,
      _hours: /week/.test(effortFor(f.field)) ? 40 : /hour/.test(effortFor(f.field)) ? 1 : 0.4,
    }));
  // Rank by impact-to-effort (quick wins + high-impact first)
  return actions.sort((a, b) => (b._impact / Math.max(0.1, b._hours)) - (a._impact / Math.max(0.1, a._hours)))
    .map(({ _impact, _hours, ...rest }) => rest);
}

function outcomeFor(field, client, competitors) {
  const compBestReviews = Math.max(0, ...competitors.map(c => c.review_count || 0));
  switch (field) {
    case "verified": return "Unlocks full ranking eligibility — verified profiles sit above unverified ones.";
    case "review_count": return `Closes the trust gap with the local leader (${compBestReviews} reviews) and lifts local-pack ranking.`;
    case "completeness": return "Each filled field adds a relevance signal Google rewards in local results.";
    case "photos": return "Listings with photos earn ~42% more direction requests.";
    case "hours_complete": return "Makes the business eligible for 'open now' searches.";
    case "qa_active": return "Each answered question becomes free long-tail content on the profile.";
    case "booking_link": return "Converts profile views into booked appointments on the spot.";
    default: return "Strengthens the profile's trust and relevance signals.";
  }
}

// Expected local outcome after the prescription (V2 "What Good Looks Like").
function buildLocalOutcome(client, competitors, actions) {
  const compBest = Math.max(0, ...competitors.map(c => c.review_count || 0));
  const target = Math.max(client.review_count + 25, Math.round(compBest * 0.6), 25);
  return `Completed, the profile reaches roughly ${target} reviews at 4.5★+, a 100% category-and-services fill, weekly posts, and answered Q&A — the configuration that wins the local pack. At that point the business appears in the top local results for its core service-in-city searches, where the majority of high-intent local clicks happen.`;
}

/**
 * Row-by-row (field-by-field) GMB analysis across the client + all competitors.
 * For each profile field: who holds the best value, the client's standing
 * (best / good / behind / missing), and the exact improvement action.
 * Drives a single detailed, colour-coded comparison table.
 */
function buildGbpFieldAnalysis(client, competitors) {
  const all = [client, ...competitors];
  const num = (v) => (typeof v === "number" ? v : v === "present" ? 1 : 0);
  const boolBest = (key) => all.some(p => p[key]); // at least one has it
  const FIELDS = [
    { key: "verified",            label: "Verified",             type: "bool",   tip: "Verify the listing via postcard or phone within 5 days — unverified profiles rank below verified ones." },
    { key: "primary_category",    label: "Primary Category",     type: "text",   tip: "Choose the single most specific category that matches the core service." },
    { key: "secondary_categories",label: "Secondary Categories", type: "num",    tip: "Add 2–3 relevant secondary categories to surface for more searches." },
    { key: "review_count",        label: "Reviews",              type: "num",    tip: "Run a post-job WhatsApp/SMS review drive to close the volume gap — the #1 local-trust signal." },
    { key: "rating",              label: "Rating",               type: "num",    tip: "Reply to every review and fix recurring complaint themes to lift the average." },
    { key: "review_recency",      label: "Review Recency",       type: "text",   tip: "Keep a steady trickle of fresh reviews — recency is a ranking and trust factor." },
    { key: "post_frequency",      label: "Google Posts",         type: "text",   tip: "Publish 1–2 Google Posts per week (offers, news, work) to signal an active profile." },
    { key: "photos",              label: "Photos",               type: "num",    tip: "Upload 10+ photos — exterior, interior, team, and work; profiles with photos get 42% more direction requests." },
    { key: "services_populated",  label: "Services Listed",      type: "bool",   tip: "List every service with a short description — feeds relevance for service searches." },
    { key: "qa_active",           label: "Q&A Active",           type: "bool",   tip: "Seed and answer 3–5 Q&As — each answer is free long-tail content." },
    { key: "hours_complete",      label: "Hours (incl. holidays)",type: "bool",  tip: "Set complete hours including holidays to appear in 'open now' searches." },
    { key: "completeness",        label: "Profile Completeness", type: "num",    tip: "Fill every remaining field — each one is a relevance signal left dark." },
    { key: "website_link",        label: "Website Link",         type: "bool",   tip: "Add the website URL — a direct conversion path." },
    { key: "booking_link",        label: "Booking Link",         type: "bool",   tip: "Add a booking/appointment link to capture intent on the spot." },
    { key: "description_complete",label: "Description",          type: "bool",   tip: "Write a 750-char description with primary keywords in the first 250 characters." },
  ];

  return FIELDS.map(f => {
    const values = all.map(p => p[f.key]);
    let bestVal, bestIdx = -1, clientStatus;
    if (f.type === "num") {
      bestVal = Math.max(...values.map(num));
      bestIdx = values.map(num).indexOf(bestVal);
      const cv = num(client[f.key]);
      clientStatus = cv === 0 ? "missing" : cv >= bestVal ? "best" : cv >= bestVal * 0.6 ? "good" : "behind";
    } else if (f.type === "bool") {
      bestVal = values.some(v => v) ? true : false;
      bestIdx = values.findIndex(v => v);
      clientStatus = client[f.key] ? "best" : (competitors.some(c => c[f.key]) ? "missing" : "behind");
    } else { // text
      const cv = client[f.key];
      clientStatus = cv ? "good" : "missing";
      bestIdx = values.findIndex(v => !!v);
      bestVal = bestIdx >= 0 ? values[bestIdx] : null;
    }
    const best_name = bestIdx >= 0 ? all[bestIdx]?.name : null;
    // Specific gap context for numeric fields
    let gap_note = "";
    if (f.type === "num" && clientStatus !== "best") {
      const lead = bestVal - num(client[f.key]);
      if (lead > 0) gap_note = `${best_name} leads by ${Math.round(lead)}.`;
    }
    return {
      field: f.key, label: f.label, type: f.type,
      client_value: client[f.key],
      best_name, best_value: bestVal,
      client_status: clientStatus,     // best | good | behind | missing
      improvement: clientStatus === "best" ? "" : f.tip,
      gap_note,
    };
  });
}

/**
 * Detailed head-to-head GBP analysis of one competitor vs the client:
 * what they do better, where they are vulnerable, a verdict, and the exact
 * play to overtake them. This is the per-competitor depth a premium tool gives.
 */
function analyseCompetitorGbp(client, comp) {
  const strengths = [];   // where the competitor beats the client
  const weaknesses = [];  // where the competitor is exposed
  const num = (v) => (typeof v === "number" ? v : (v === "present" ? 1 : 0));

  // Reviews
  const cr = comp.review_count || 0, ur = client.review_count || 0;
  if (cr > ur) strengths.push(`Holds ${cr} reviews vs your ${ur} (a ${cr - ur}-review lead) — the strongest local-trust and ranking signal.`);
  else if (cr < ur) weaknesses.push(`Only ${cr} reviews vs your ${ur} — you already lead on social proof here.`);

  // Rating
  if ((comp.rating || 0) > (client.rating || 0)) strengths.push(`Higher rating: ${comp.rating}★ vs your ${client.rating ?? "—"}★.`);
  else if ((comp.rating || 0) < (client.rating || 0) && comp.rating) weaknesses.push(`Lower rating (${comp.rating}★) than you (${client.rating}★) — exploit this in messaging.`);

  // Verification
  if (comp.verified && !client.verified) strengths.push("Verified profile while yours is not — a structural ranking advantage.");
  if (!comp.verified) weaknesses.push("Profile is unverified — vulnerable to being outranked by a verified, complete profile.");

  // Completeness
  if ((comp.completeness || 0) > (client.completeness || 0)) strengths.push(`Profile ${comp.completeness}% complete vs your ${client.completeness ?? "—"}% — more relevance signals filled in.`);
  else if ((comp.completeness || 0) < (client.completeness || 0)) weaknesses.push(`Profile only ${comp.completeness}% complete — gaps you can out-fill.`);

  // Photos / posts / Q&A
  if (num(comp.photos) > num(client.photos)) strengths.push("Deeper photo set — drives more direction requests and dwell.");
  if (!comp.qa_active) weaknesses.push("No active Q&A — an easy content/visibility gap to claim first.");
  if (!comp.post_frequency) weaknesses.push("No regular Google Posts — freshness signal left on the table.");
  if (!comp.booking_link) weaknesses.push("No booking/appointment link — a conversion path they are not using.");

  // Threat score (0-100): how dominant this competitor's GBP is vs the client
  let threat = 50;
  threat += (cr - ur) > 0 ? Math.min(25, (cr - ur) / 8) : -10;
  threat += (comp.rating || 0) > (client.rating || 0) ? 8 : -5;
  threat += (comp.completeness || 0) > (client.completeness || 0) ? 8 : -5;
  threat += comp.verified && !client.verified ? 9 : 0;
  threat = Math.max(0, Math.min(100, Math.round(threat)));
  const threat_level = threat >= 70 ? "HIGH" : threat >= 45 ? "MEDIUM" : "LOW";

  // The overtake play — the single most leveraged move against this competitor
  let overtake_play;
  if (cr - ur > 10) overtake_play = `Close the review gap: a 6–8 week WhatsApp/SMS review drive after each job narrows ${cr - ur} reviews fastest — review volume is what their lead rests on.`;
  else if (comp.verified && !client.verified) overtake_play = "Verify and fully complete your profile — until then this competitor is structurally ahead regardless of other work.";
  else if ((client.completeness || 0) < (comp.completeness || 0)) overtake_play = `Out-complete them: fill every field they have and the ones they don't (Q&A, services, posts) to pass ${comp.completeness}% completeness.`;
  else overtake_play = "Out-publish them: weekly Google Posts, fresh photos, and answered Q&A will compound a freshness edge they are not maintaining.";

  const verdict = threat >= 70
    ? `${comp.name} is the GBP benchmark to beat in this market.`
    : threat >= 45
      ? `${comp.name} is a credible local rival with clear, closable gaps.`
      : `${comp.name} is beatable now — their profile has more weaknesses than strengths versus yours.`;

  return {
    name: comp.name,
    threat_score: threat,
    threat_level,
    verdict,
    review_count: comp.review_count,
    rating: comp.rating,
    completeness: comp.completeness,
    verified: comp.verified,
    strengths: strengths.length ? strengths : ["No standout GBP advantages over your profile."],
    weaknesses: weaknesses.length ? weaknesses : ["A well-maintained profile with few obvious gaps."],
    overtake_play,
  };
}

function computeGbpGaps(client, competitors) {
  if (!competitors.length) {
    return {
      biggestGap: "Competitor GBP data unavailable — manual competitor profile review recommended to benchmark this listing.",
      fastestWin: deriveFastestWin(client),
      trustGap:   "Without competitor benchmarks, prioritise reaching 25+ reviews at 4.5★ as the baseline trust threshold for local search.",
    };
  }

  // Strongest competitor = highest review count (proxy for local dominance)
  const strongest = competitors.reduce((a, b) => (b.review_count > a.review_count ? b : a), competitors[0]);

  // Biggest visibility gap: field where client is furthest behind strongest competitor
  const reviewGap = (strongest.review_count || 0) - (client.review_count || 0);
  let biggestGap;
  if (reviewGap > 0) {
    biggestGap = `Review volume. ${strongest.name} holds ${strongest.review_count} reviews vs your ${client.review_count} — a ${reviewGap}-review deficit. Review count is the strongest local-ranking and trust lever, and this gap is suppressing your visibility in the local pack.`;
  } else if (!client.verified && strongest.verified) {
    biggestGap = `Verification. ${strongest.name} is verified and you are not — unverified profiles are structurally ranked below verified competitors regardless of other signals.`;
  } else if ((client.completeness || 0) < (strongest.completeness || 0)) {
    biggestGap = `Profile completeness. ${strongest.name} sits at ${strongest.completeness}/100 vs your ${client.completeness}/100. Each unfilled field is a ranking signal left dark.`;
  } else {
    biggestGap = `Posting cadence and photos. ${strongest.name} maintains active posts and a deeper photo set — freshness signals that compound over time.`;
  }

  return {
    biggestGap,
    fastestWin: deriveFastestWin(client),
    trustGap:   deriveTrustGap(client, strongest),
  };
}

function deriveFastestWin(client) {
  if (!client.hours_complete) return "Set complete business hours including holiday hours. ~10 minutes, and it unlocks ‘open now’ visibility immediately.";
  if (!client.website_link)   return "Add the website link to the profile. ~5 minutes; it is a direct conversion path currently missing.";
  if (!client.description_complete) return "Write the 750-character business description with primary keywords in the first 250. ~30 minutes.";
  if (client.photos === 0) return "Upload 10+ photos (exterior, interior, team, work). ~30 minutes; listings with photos earn 42% more direction requests.";
  if (client.qa_answered === 0) return "Seed and answer 3–5 Q&A entries. ~20 minutes; each answer becomes free long-tail content.";
  return "Publish a Google Business post this week and commit to 1–2 per week. ~15 minutes each; signals an active, trustworthy profile.";
}

function deriveTrustGap(client, strongest) {
  const clientRating = client.rating || 0;
  const compRating   = strongest.rating || 0;
  if (compRating > clientRating && client.review_count < strongest.review_count) {
    return `When a customer sees both profiles side by side, ${strongest.name}'s ${compRating}★ across ${strongest.review_count} reviews reads as established and safe, while ${client.review_count} reviews reads as unproven. The combination of rating and volume is the single biggest factor in the click decision — closing review volume is the trust play.`;
  }
  if (!client.verified) {
    return "The missing verified badge is the trust gap. Customers subconsciously treat unverified listings as higher-risk; verification is the precondition for being chosen over a verified competitor.";
  }
  return `Maintain response rate and review freshness — a profile that visibly replies and collects recent reviews beats a static competitor profile in the side-by-side trust decision.`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPREHENSIVE COMPETITIVE ANALYSIS (us vs them across every dimension)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Full head-to-head competitive intelligence: compares the client against every
 * competitor across Technical, Content, Schema/GEO, Authority, and Local/GMB —
 * stating where the CLIENT wins (edges), where COMPETITORS win (gaps), and a
 * prioritised, specific improvement roadmap to close each gap.
 *
 * @param {object} input {
 *   client: { crawl, gmb, baseline },          // baseline = formatted metric values map
 *   competitorAudits: [{ name, domain, crawl, gmb }],
 * }
 */
export function buildCompetitiveAnalysis(input = {}) {
  const { client = {}, competitorAudits = [] } = input;
  const comps = (competitorAudits || []).filter(c => c && (c.crawl || c.gmb) && !(c.crawl?.error && c.gmb?.error));
  if (!comps.length) {
    // Competitor names exist but no usable audit data → return a minimal structure
    // (NOT null) so the section still shows the rivals + a note instead of vanishing.
    const names = (competitorAudits || []).map(c => c?.name || c?.domain).filter(Boolean);
    if (!names.length) return null;
    return {
      dimensions: [],
      your_edges: [],
      their_edges: [],
      overall_verdict: `${names.length} competitor${names.length !== 1 ? "s" : ""} identified (${names.slice(0, 4).join(", ")}). The full head-to-head scorecard populates once each rival's live profile and crawl data are captured.`,
    };
  }

  const cCrawl = client.crawl || {};
  const cGmb   = client.gmb || {};
  const cBase  = client.baseline || {};
  const val    = (k) => cBase[k]?.value ?? null;

  // Extract a comparable metric from a competitor audit.
  const compMetric = (c, fn) => { try { return fn(c); } catch { return null; } };
  const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
  const best = (arr, dir = "high") => arr.length ? (dir === "high" ? Math.max(...arr) : Math.min(...arr)) : null;

  const dimensions = [];
  const addDim = (dimension, clientValue, compValues, dir, fmt, improveFn) => {
    const vals = compValues.filter(v => v != null);
    if (clientValue == null && !vals.length) return;
    const compBestVal = vals.length ? best(vals, dir) : null;
    const compAvgVal  = vals.length ? Math.round(avg(vals) * 10) / 10 : null;
    const bestIdx = vals.length ? compValues.findIndex(v => v === compBestVal) : -1;
    const compBestName = bestIdx >= 0 ? comps[bestIdx]?.name : null;
    let winner = "tie";
    if (clientValue != null && compBestVal != null) {
      const clientBetter = dir === "high" ? clientValue >= compBestVal : clientValue <= compBestVal;
      winner = clientBetter ? "you" : "them";
    } else if (clientValue != null) winner = "you";
    else if (compBestVal != null) winner = "them";
    dimensions.push({
      dimension,
      client_value: clientValue, client_display: fmt(clientValue),
      competitor_best: compBestVal, competitor_best_display: fmt(compBestVal), competitor_best_name: compBestName,
      competitor_avg: compAvgVal,
      winner,
      improvement: winner === "them" ? improveFn(clientValue, compBestVal, compBestName) : null,
    });
  };

  // ── Technical health ──
  addDim("Site Health", cCrawl.healthScore ?? null,
    comps.map(c => compMetric(c, x => x.crawl?.healthScore)), "high",
    (v) => v == null ? "—" : `${v}/100`,
    (cv, bv, bn) => `Raise site health from ${cv ?? "—"} to beat ${bn || "the leader"}'s ${bv}: clear the crawl errors, broken links, and duplicate tags first.`);

  // ── Schema / GEO readiness ──
  const clientSchema = (cCrawl.summary?.pagesWithSchemaTypes || []).length;
  addDim("Structured Data (GEO)", clientSchema,
    comps.map(c => compMetric(c, x => (x.crawl?.summary?.pagesWithSchemaTypes || []).length)), "high",
    (v) => v == null ? "—" : `${v} types`,
    (cv, bv, bn) => `${bn || "A competitor"} ships ${bv} schema types vs your ${cv}. Add LocalBusiness + FAQPage + Service JSON-LD to become citable in AI answers.`);

  // ── Content depth ──
  addDim("Avg Content Depth", cCrawl.summary?.avgWordCount ?? null,
    comps.map(c => compMetric(c, x => x.crawl?.summary?.avgWordCount)), "high",
    (v) => v == null ? "—" : `${v} words/page`,
    (cv, bv, bn) => `${bn || "The leader"} averages ${bv} words/page vs your ${cv ?? "—"}. Expand thin pages to 800+ words with FAQs and local context.`);

  // ── Page footprint ──
  addDim("Indexable Pages", cCrawl.totalPagesEstimate || cCrawl.pageCount || null,
    comps.map(c => compMetric(c, x => x.crawl?.totalPagesEstimate || x.crawl?.pageCount)), "high",
    (v) => v == null ? "—" : `${v} pages`,
    (cv, bv, bn) => `${bn || "A competitor"} covers ${bv} pages vs your ${cv ?? "—"} — build the missing commercial and city pages mapped in the content section.`);

  // ── Local: reviews ──
  addDim("Google Reviews", cGmb.gmb?.reviewCount ?? cGmb.reviewCount ?? null,
    comps.map(c => compMetric(c, x => x.gmb?.gmb?.reviewCount ?? x.gmb?.reviewCount)), "high",
    (v) => v == null ? "—" : `${v}`,
    (cv, bv, bn) => `${bn || "The local leader"} holds ${bv} reviews vs your ${cv ?? 0} — run a post-job WhatsApp/SMS review drive to close the trust gap.`);

  // ── Local: rating ──
  addDim("Google Rating", cGmb.gmb?.rating ?? null,
    comps.map(c => compMetric(c, x => x.gmb?.gmb?.rating)), "high",
    (v) => v == null ? "—" : `${v}★`,
    (cv, bv, bn) => `Lift rating toward ${bn || "the leader"}'s ${bv}★ by resolving the themes in negative reviews and replying to every one.`);

  // ── Local: completeness ──
  addDim("GBP Completeness", cGmb.completeness?.score ?? null,
    comps.map(c => compMetric(c, x => x.gmb?.completeness?.score)), "high",
    (v) => v == null ? "—" : `${v}/100`,
    (cv, bv, bn) => `${bn || "A competitor"} runs a ${bv}/100 profile vs your ${cv ?? "—"} — fill categories, services, hours, photos and Q&A to overtake.`);

  const your_edges  = dimensions.filter(d => d.winner === "you").map(d => ({ dimension: d.dimension, advantage: `You lead on ${d.dimension.toLowerCase()} (${d.client_display}${d.competitor_best_display !== "—" ? ` vs best competitor ${d.competitor_best_display}` : ""}) — defend and promote this.` }));
  const their_edges = dimensions.filter(d => d.winner === "them").map(d => ({ dimension: d.dimension, gap: `${d.competitor_best_name || "A competitor"} leads on ${d.dimension.toLowerCase()} (${d.competitor_best_display} vs your ${d.client_display}).`, improvement: d.improvement }));

  // Improvement roadmap — biggest, most strategic gaps first.
  const priorityOf = (dim) => /review|completeness|health|schema/i.test(dim) ? "HIGH" : "MEDIUM";
  const effortOf   = (dim) => /review/i.test(dim) ? "≈6–8 weeks" : /schema/i.test(dim) ? "≈1 day" : /completeness|rating/i.test(dim) ? "≈3 hours" : "≈1–2 weeks";
  const improvement_roadmap = their_edges.map(g => ({
    priority: priorityOf(g.dimension), area: g.dimension, gap: g.gap, action: g.improvement, effort: effortOf(g.dimension),
  })).sort((a, b) => (a.priority === "HIGH" ? 0 : 1) - (b.priority === "HIGH" ? 0 : 1));

  const winCount = your_edges.length, gapCount = their_edges.length;
  const overall_verdict = gapCount === 0
    ? `Across every measured dimension, the site matches or leads its competitors — the work now is widening the lead.`
    : winCount > gapCount
      ? `The site leads on ${winCount} of ${dimensions.length} dimensions and trails on ${gapCount}. Closing those ${gapCount} gaps converts a competitive position into a dominant one.`
      : winCount === 0
        ? `Competitors currently lead on every measured dimension — the roadmap below is the catch-up sequence, ordered by impact.`
        : `Competitors lead on ${gapCount} of ${dimensions.length} dimensions vs your ${winCount}. The roadmap below closes the gaps in priority order.`;

  return { dimensions, your_edges, their_edges, improvement_roadmap, overall_verdict, competitor_count: comps.length };
}

// ═══════════════════════════════════════════════════════════════════════════════
// KPI DIRECTIONAL VALIDATION (Problem 6)
// ═══════════════════════════════════════════════════════════════════════════════

// Metrics where a higher value is better.
const HIGHER_IS_BETTER = new Set([
  "organic_traffic", "organic_keywords", "referring_domains", "domain_rating",
  "gbp_completeness", "gbp_review_count", "review_count", "review_rating", "gbp_rating",
  "site_health_score", "mobile_performance_score", "desktop_performance_score",
]);

// Metrics where a lower value is better.
const LOWER_IS_BETTER = new Set([
  "page_load_time", "lcp", "cls", "core_web_vitals", "error_count", "crawl_issues",
  "errors_404", "redirect_chains",
]);

/**
 * Validate and (where needed) generate KPI targets so every target represents
 * genuine directional improvement over the baseline. (Problem 6)
 *
 * @param {Array} metrics  [{ metric, key, baseline, target_6_months, target_12_months, ... }]
 * @param {object} ctx     { acceptedKeywordCount, avgDifficulty }
 * @returns {Array} validated metrics with validation_status + estimation_note
 */
export function validateKpis(metrics = [], ctx = {}) {
  return metrics.map(m => validateOneKpi(m, ctx));
}

function validateOneKpi(m, ctx) {
  const key = (m.key || m.metric || "").toLowerCase().replace(/[\s/]+/g, "_");
  const baseline = parseMetricValue(m.baseline);

  const higher = HIGHER_IS_BETTER.has(key);
  const lower  = LOWER_IS_BETTER.has(key);

  // Baseline unavailable → never output zero; provide projection or explicit label
  if (baseline == null) {
    return {
      ...m,
      baseline: m.baseline ?? null,
      validation_status: "baseline_unavailable",
      estimation_note: m.baseline == null
        ? "Baseline currently unavailable. Capture it before confirming targets — see measurement guidance."
        : (m.estimation_note || ""),
      target_3_months:  m.target_3_months ?? null,
      target_6_months:  m.target_6_months ?? "To be set after baseline data establishes",
      target_12_months: m.target_12_months ?? "To be set after baseline data establishes",
    };
  }

  // Baseline is zero on a traffic/keyword metric → generate reasoned projection
  if (baseline === 0 && higher) {
    const projected = projectFromZero(key, ctx);
    return {
      ...m,
      baseline: 0,
      target_3_months:  projected.t3,
      target_6_months:  projected.t6,
      target_12_months: projected.t12,
      validation_status: "projected_from_zero",
      estimation_note: projected.note,
    };
  }

  // Validate / repair direction
  let t6  = parseMetricValue(m.target_6_months);
  let t12 = parseMetricValue(m.target_12_months);
  let status = "valid";
  const repairs = [];

  if (higher) {
    if (t6 == null || t6 <= baseline)  { t6 = improveUp(baseline, 6);  repairs.push("6m"); }
    if (t12 == null || t12 <= baseline || t12 <= t6) { t12 = improveUp(baseline, 12); repairs.push("12m"); }
  } else if (lower) {
    if (t6 == null || t6 >= baseline)  { t6 = improveDown(baseline, 6);  repairs.push("6m"); }
    if (t12 == null || t12 >= baseline || t12 >= t6) { t12 = improveDown(baseline, 12); repairs.push("12m"); }
  }

  if (repairs.length) status = "auto_corrected";

  return {
    ...m,
    baseline,
    target_3_months:  m.target_3_months ?? null,
    target_6_months:  t6,
    target_12_months: t12,
    validation_status: status,
    estimation_note: m.estimation_note ||
      (status === "auto_corrected"
        ? `Target auto-corrected to enforce directional improvement over baseline (${baseline}).`
        : `Validated: target improves on baseline of ${baseline}.`),
  };
}

function improveUp(baseline, months) {
  const factor = months >= 12 ? 2.5 : 1.6;
  // For small ratings (≤5) add increments rather than multiply
  if (baseline <= 5) return Math.min(5, Math.round((baseline + (months >= 12 ? 0.5 : 0.3)) * 10) / 10);
  // 0-100 scores (DA, site health, GBP completeness, mobile/desktop perf) — additive,
  // but CAPPED at 100 so a high baseline can't project to an impossible 104/122.
  if (baseline <= 100) return Math.min(100, Math.round(baseline + (months >= 12 ? 30 : 12)));
  return Math.round(baseline * factor);
}

function improveDown(baseline, months) {
  const factor = months >= 12 ? 0.5 : 0.75;
  // Large values (e.g. LCP in ms) → whole numbers; small values (CLS) keep 2 decimals.
  return baseline >= 100 ? Math.round(baseline * factor) : Math.round(baseline * factor * 100) / 100;
}

/**
 * Reasoned projection for a zero baseline (Problem 6 formula):
 * (keyword clusters) × (achievable position CTR) × (monthly volume)
 */
function projectFromZero(key, ctx) {
  const clusters = ctx.acceptedKeywordCount || 5;
  const avgVolume = ctx.avgKeywordVolume || 400;
  const avgDifficulty = ctx.avgDifficulty || 40;

  // CTR by achievable position, gated by difficulty
  const achievablePos = avgDifficulty < 30 ? 5 : avgDifficulty < 50 ? 8 : 15;
  const ctrByPos = achievablePos <= 5 ? 0.06 : achievablePos <= 10 ? 0.025 : 0.01;

  if (key === "organic_keywords") {
    const t6 = Math.round(clusters * 3);
    return {
      t3: Math.round(clusters * 1.2),
      t6,
      t12: Math.round(clusters * 8),
      note: `Projected from ${clusters} keyword clusters being targeted. Each cluster typically surfaces 3–8 ranking long-tail variants as content matures.`,
    };
  }

  // organic_traffic style
  const monthly6  = Math.round(clusters * avgVolume * ctrByPos);
  const monthly12 = Math.round(clusters * avgVolume * (ctrByPos * 2));
  return {
    t3: Math.round(monthly6 * 0.4),
    t6: monthly6,
    t12: monthly12,
    note: `Projection = ${clusters} clusters × ${avgVolume} avg monthly volume × ${(ctrByPos * 100).toFixed(1)}% CTR at the achievable position (#${achievablePos}, gated by ~${avgDifficulty} difficulty).`,
  };
}

function parseMetricValue(v) {
  if (v == null) return null;
  if (typeof v === "number") return v;
  const s = String(v).replace(/[,\s]/g, "").replace(/\/100$/, "").replace(/\/mo$/i, "").replace(/[★%]/g, "");
  const m = s.match(/^([0-9.]+)([KkMm]?)/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const mult = m[2]?.toLowerCase() === "k" ? 1000 : m[2]?.toLowerCase() === "m" ? 1e6 : 1;
  return Math.round(n * mult * 100) / 100;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TECHNICAL ISSUES (Part 2 schema: technical_issues[])
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build the structured technical_issues array from crawl data.
 * Each issue: { priority, issue, affected_count, recommended_action, estimated_effort }
 * Ranked CRITICAL → HIGH → MEDIUM → LOW. Every recommendation is developer-actionable.
 */
export function buildTechnicalIssues(crawlData) {
  if (!crawlData) return [];
  const s = crawlData.summary || {};
  const issues = [];
  // True site size for sitewide framing: prefer Google-indexed / sitemap total
  // over the number of pages we deep-audited (a sample).
  const siteSize = crawlData.totalPagesEstimate || crawlData.indexedPages || crawlData.sitemapUrlCount || crawlData.pageCount || null;

  // V3 §07 — every technical fix carries all five fields:
  // issue · why_it_matters · recommended_action (what to do) · estimated_effort · expected_unlock
  if (crawlData.crawlBlockedByRobots)
    issues.push({ priority: "CRITICAL", issue: "Googlebot blocked by robots.txt", affected_count: siteSize, why_it_matters: "Google cannot index a single page while this stands — the entire site is invisible in organic search, so every other improvement is dark.", recommended_action: "Remove 'Disallow: /' from /robots.txt and re-request indexing in Google Search Console.", estimated_effort: "≈15 min", expected_unlock: "Every page becomes eligible to rank — this single fix unlocks the return on all other work." });

  if (!crawlData.hasSitemap)
    issues.push({ priority: "HIGH", issue: "XML sitemap missing", affected_count: siteSize, why_it_matters: "Without a sitemap, crawl discovery of a large site is throttled, so new and deep pages stay unindexed for weeks.", recommended_action: `Generate /sitemap.xml listing all canonical URLs${siteSize ? ` (≈${siteSize} pages detected)` : ""} and submit it in Google Search Console → Sitemaps.`, estimated_effort: "≈1 hour", expected_unlock: "Faster, complete indexation of every canonical URL." });

  if (!(s.pagesWithSchemaTypes || []).length)
    issues.push({ priority: "HIGH", issue: "Zero structured data (schema) sitewide", affected_count: siteSize, why_it_matters: "Without structured data the site cannot be parsed into entities, so it is invisible to AI answer engines and ineligible for rich results.", recommended_action: "Add LocalBusiness + WebSite JSON-LD to the homepage, Service schema to service pages, and FAQPage schema to FAQ blocks.", estimated_effort: "≈1 day", expected_unlock: "Eligibility for rich results and AI Overview / GEO citation." });

  if ((s.pagesMissingMetaTitle || 0) > 0)
    issues.push({ priority: "HIGH", issue: `${s.pagesMissingMetaTitle} pages missing <title> tags`, affected_count: s.pagesMissingMetaTitle, why_it_matters: "The <title> is the single strongest on-page ranking signal and the clickable headline in search results.", recommended_action: 'Write unique 50–60 char titles as "Primary Keyword | Brand", starting with highest-traffic pages.', estimated_effort: "≈3 hours", expected_unlock: "Recovered relevance and click-through on every fixed page." });

  if ((s.pagesMissingH1 || 0) > 0)
    issues.push({ priority: "HIGH", issue: `${s.pagesMissingH1} pages with no H1`, affected_count: s.pagesMissingH1, why_it_matters: "The H1 is the clearest on-page topic signal Google reads; without it, pages are ambiguous about what they rank for.", recommended_action: "Add exactly one keyword-rich H1 per page.", estimated_effort: "≈2 hours", expected_unlock: "Sharper topical relevance on each affected page." });

  const lcpVal = crawlData.coreWebVitals?.lcp ?? crawlData.coreWebVitals?.LCP;
  if (lcpVal && Number(lcpVal) > 2500)
    issues.push({ priority: "HIGH", issue: `Mobile LCP at ${lcpVal}ms (target <2500ms)`, affected_count: crawlData.pageCount || null, why_it_matters: "Core Web Vitals are a mobile ranking signal; a slow LCP suppresses the majority of mobile searches regardless of content quality.", recommended_action: "Compress hero images to WebP, preload the LCP element, and defer non-critical JS.", estimated_effort: "≈1 week", expected_unlock: "Moves pages out of the speed-penalty tier into the eligible ranking band." });

  if ((s.pagesMissingMetaDesc || 0) > 0)
    issues.push({ priority: "MEDIUM", issue: `${s.pagesMissingMetaDesc} pages missing meta descriptions`, affected_count: s.pagesMissingMetaDesc, why_it_matters: "The description is the snippet that wins or loses the click on impressions the site already earns.", recommended_action: "Write 150–160 char descriptions with a clear CTA.", estimated_effort: "≈2 hours", expected_unlock: "5–10% more clicks from rankings already held." });

  const dupTitles = (crawlData.duplicates || []).filter(d => d.type === "title").length;
  if (dupTitles > 0)
    issues.push({ priority: "MEDIUM", issue: `${dupTitles} sets of duplicate meta titles`, affected_count: dupTitles, why_it_matters: "Duplicate titles force Google to pick a ranking URL arbitrarily, splitting relevance across competing pages.", recommended_action: "Make every title unique to its page and intent.", estimated_effort: "≈2 hours", expected_unlock: "Consolidated ranking signal per page." });

  if ((crawlData.brokenLinks || []).length > 0)
    issues.push({ priority: "MEDIUM", issue: `${crawlData.brokenLinks.length} broken internal links`, affected_count: crawlData.brokenLinks.length, why_it_matters: "Broken internal links waste crawl budget and leak link equity into dead ends.", recommended_action: `Fix or 301-redirect each. First: ${crawlData.brokenLinks.slice(0, 2).map(b => b.url).join(", ")}`, estimated_effort: "≈2 hours", expected_unlock: "Recovered crawl efficiency and internal link equity." });

  if ((s.thinContentCount || 0) > 0)
    issues.push({ priority: "MEDIUM", issue: `${s.thinContentCount} thin-content pages (<200 words)`, affected_count: s.thinContentCount, why_it_matters: "Thin pages drag down the sitewide quality signal Google applies to the whole domain.", recommended_action: "Expand to 600+ words with FAQs and local context.", estimated_effort: "≈1 week", expected_unlock: "A stronger sitewide quality signal lifting all pages." });

  if ((s.totalImgsWithoutAlt || 0) > 5)
    issues.push({ priority: "MEDIUM", issue: `${s.totalImgsWithoutAlt} images without alt text`, affected_count: s.totalImgsWithoutAlt, why_it_matters: "Missing alt text costs image-search visibility and lowers the accessibility score.", recommended_action: "Add descriptive, keyword-natural alt text.", estimated_effort: "≈2 hours", expected_unlock: "Image-search traffic and a cleaner accessibility profile." });

  if ((s.pagesMultipleH1 || 0) > 0)
    issues.push({ priority: "LOW", issue: `${s.pagesMultipleH1} pages with multiple H1s`, affected_count: s.pagesMultipleH1, why_it_matters: "Multiple H1s dilute the single clear topic signal per page.", recommended_action: "Demote extra H1s to H2/H3 — one H1 per page.", estimated_effort: "≈1 hour", expected_unlock: "A single unambiguous topic signal per page." });

  if (!crawlData.hasRobots)
    issues.push({ priority: "LOW", issue: "robots.txt not found", affected_count: null, why_it_matters: "Without robots.txt crawlers get no sitemap directive or crawl guidance.", recommended_action: "Create /robots.txt with a Sitemap: directive pointing to your sitemap.xml.", estimated_effort: "≈15 min", expected_unlock: "Clear crawl guidance and sitemap discovery." });

  const rank = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  return issues.sort((a, b) => rank[a.priority] - rank[b.priority]).slice(0, 12);
}

// ═══════════════════════════════════════════════════════════════════════════════
// GEO & AI VISIBILITY (Part 2 schema: geo_and_ai_visibility) — Section 10
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build the geo_and_ai_visibility object: current citation estimate, competitor
 * benchmarks, recommended actions, and ready-to-implement schema (JSON-LD).
 * Schema additions live here per spec (NOT in content_architecture).
 */
export function buildGeoVisibility(input = {}) {
  const { domain, clientName, industry = "", baseline = {}, hasSchema = false, competitors = [] } = input;

  // Citation likelihood is a function of authority + schema presence.
  const dr = baseline.domain_rating?.value ?? 0;
  const currentCitations = hasSchema && dr > 20 ? "Low (occasional)" : "Effectively zero — not a citable source yet";

  const competitorBenchmarks = (competitors || []).slice(0, 3).map(c => ({
    competitor: c.name || c.domain,
    estimated_citations: (c.gbp_data?.reviewCount || 0) > 100 ? "Moderate" : "Low",
  }));

  const recommended_actions = [
    "Add answer-first content blocks: open key pages with a 40–60 word direct answer to the primary question before any preamble — answer engines lift these verbatim.",
    "Implement FAQPage JSON-LD on every page with a Q&A section so the questions become eligible for AI Overviews and rich results.",
    "Add Organization + LocalBusiness schema with sameAs links to social/citation profiles so LLMs build a reliable entity graph for the brand.",
    "Use consistent definitional language — define your category and services the same way across every page so the entity is unambiguous to LLMs.",
    "Publish original data or statistics with clear attribution — answer engines preferentially cite primary sources.",
  ];

  const orgSchema = buildOrgSchemaJsonLd({ domain, clientName, industry, baseline });
  const faqSchema = buildFaqSchemaJsonLd(industry);

  // ── GEO-readiness scorecard — LLM-optimization factors, data-derived ──────────
  const gbpComplete = baseline.gbp_completeness?.value ?? 0;
  const geo_readiness = [
    { factor: "Structured data (schema)", status: hasSchema ? "Present" : "Missing",
      detail: hasSchema ? "The site exposes JSON-LD, so AI engines can identify the entity." : "No JSON-LD found — AI engines can't reliably identify the business. Add the schema below." },
    { factor: "Answer-style formatting", status: "Needs work",
      detail: "Open key pages with a 40–60 word direct answer — that is the text AI tools lift verbatim." },
    { factor: "Entity clarity (consistent NAP & naming)", status: gbpComplete >= 80 ? "Strong" : "Needs work",
      detail: "Define the business and category the same way across every page and profile so the entity is unambiguous." },
    { factor: "FAQ / Q&A coverage", status: "Needs work",
      detail: "Add 5–8 schema-marked Q&As per key page so questions become eligible for AI Overviews." },
    { factor: "Citation-worthiness (authority)", status: dr >= 30 ? "Moderate" : "Low",
      detail: `Domain Rating ${dr} — answer engines preferentially cite higher-authority, original sources.` },
  ];

  // ── Prompt tracking — the prompts the LIVE multi-engine AI-visibility scan
  //    will run. Status stays "Pending" until that browser-automation scan runs. ──
  const ind = String(industry || "your services").toLowerCase();
  const brand = clientName || domain;
  const _rawViz = input.aiResponses || input.ai_visibility_raw || null;
  // When a live scan exists, show the ACTUAL prompts run + the engines measured;
  // otherwise a brand-NEUTRAL placeholder preview (never seed the brand name).
  const tracked_prompts = (_rawViz?.prompts?.length)
    ? _rawViz.prompts.slice(0, 20)
    : [`best ${ind} in India 2026`, `top ${ind} companies in India`, `most affordable ${ind} in India`, `top rated ${ind} near me`, `best ${ind} for small businesses`, `${ind} reviews and ratings`];
  const ai_platforms = (_rawViz?.responses?.length)
    ? [...new Set(_rawViz.responses.map(r => r.engine).filter(Boolean))].map(platform => ({ platform, visibility: "Measured (live scan)" }))
    : ["ChatGPT", "Google AI Overviews", "Gemini", "Perplexity", "Claude"].map(platform => ({ platform, visibility: "Pending live scan" }));
  // ── LIVE AI visibility (proprietary SoV + Citation logic) — computed ONLY when
  //    the multi-engine collector has supplied raw responses (input.aiResponses);
  //    null otherwise, so the deterministic placeholders above still show. ───────
  let share_of_voice = null, citation_analysis = null, geo_metrics = null, topic_dominance = null;
  const raw = input.aiResponses || input.ai_visibility_raw || null;
  if (raw && Array.isArray(raw.responses) && raw.responses.length) {
    const _brandSet = raw.brandSet || [clientName || domain, ...(competitors || []).map(c => c.name || c.domain).filter(Boolean)];
    const _compDomains = raw.competitorDomains || (competitors || []).map(c => c.domain).filter(Boolean);
    share_of_voice = buildShareOfVoice({ brandSet: _brandSet, client: clientName || domain, responses: raw.responses });
    citation_analysis = buildCitationAnalysis({
      clientDomain: raw.clientDomain || domain, clientName: clientName || domain,
      competitorDomains: _compDomains, responses: raw.responses,
    });
    // §20 — full two-layer metric matrix (overall + per engine, brand + competitors).
    geo_metrics = buildGeoMetrics({
      brandSet: _brandSet, client: clientName || domain,
      clientDomain: raw.clientDomain || domain, competitorDomains: _compDomains, responses: raw.responses,
    });
    // §25 — deterministic per-topic dominance (hard numbers alongside Claude's read).
    topic_dominance = buildTopicDominance({ brandSet: _brandSet, client: clientName || domain, responses: raw.responses });
  }
  // §21 — weighted composite GEO score (only when the live scan supplied data).
  const geo_score = (share_of_voice || citation_analysis)
    ? computeGeoScore({ share_of_voice, citation_analysis })
    : null;

  // §25 — competitor intelligence (raw metrics from the SoV; deterministic).
  let competitor_intel = null;
  if (share_of_voice?.by_brand?.length > 1) {
    const bb = share_of_voice.by_brand;
    const me = bb.find(b => b.is_client);
    const top = bb.filter(b => !b.is_client).sort((a, c) => c.avg - a.avg)[0];
    if (top) {
      const eng = (share_of_voice.engines || []).slice().sort((a, c) => (top.per_engine[c] || 0) - (top.per_engine[a] || 0))[0] || null;
      competitor_intel = {
        leader: top.brand, leader_sov: top.avg, client_sov: me ? me.avg : 0,
        gap: Math.round((top.avg - (me ? me.avg : 0)) * 10) / 10,
        leader_strongest_engine: eng,
        competitors: bb.filter(b => !b.is_client).map(b => ({ brand: b.brand, sov_avg: b.avg, per_engine: b.per_engine })),
        summary: `${top.brand} leads AI visibility at ${top.avg}% average share of voice${me ? ` versus your ${me.avg}%` : ""}${eng ? `, strongest on ${eng}` : ""}. Match their cited sources and topic coverage to close the gap.`,
      };
    }
  }

  const live = !!(share_of_voice || citation_analysis);
  const prompt_tracking_status = live
    ? `Live — measured across ${(share_of_voice?.engines || []).join(", ") || "the AI engines"} from the multi-engine scan.`
    : "Pending — the live multi-engine AI-visibility scan (ChatGPT, Gemini, Perplexity, Copilot) is a separate module; the prompts below are what it will track.";

  return {
    current_ai_citation_count: currentCitations,
    competitor_citation_benchmarks: competitorBenchmarks,
    share_of_voice,         // proprietary SoV table (null until collector runs)
    citation_analysis,      // proprietary citation intelligence + opportunity queue (§23-24)
    geo_score,              // §21 weighted composite GEO score (null until collector runs)
    geo_metrics,            // §20 full two-layer metric matrix (overall + per engine)
    topic_dominance,        // §25 deterministic per-topic dominance (lost/contested topics)
    competitor_intel,       // §25 competitor intelligence (null until collector runs)
    geo_insights: raw?.geo_insights || null, // §25 Claude deep analysis (why competitors win + actions)
    geo_readiness,
    tracked_prompts,
    ai_platforms,
    prompt_tracking_status,
    recommended_actions,
    schema_additions: [
      { type: "Organization + LocalBusiness", jsonld: orgSchema },
      { type: "FAQPage", jsonld: faqSchema },
    ],
    geo_principles: [
      { title: "Answer-first formatting", detail: "Lead with the direct answer; engines lift the first 40–60 words." },
      { title: "Entity clarity", detail: "Name the business and category consistently so the knowledge graph is unambiguous." },
      { title: "Consistent definitional language", detail: "Define services identically across pages to reinforce the entity." },
      { title: "Vocabulary coverage", detail: "Cover the full topic vocabulary so the page matches more AI sub-queries." },
    ],
  };
}

function buildOrgSchemaJsonLd({ domain, clientName, industry, baseline }) {
  const url = domain?.includes("://") ? domain : `https://${domain}`;
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "name": clientName || domain,
    "url": url,
    "description": `${clientName || domain} — ${industry || "services"}.`,
    "address": { "@type": "PostalAddress", "addressCountry": "IN" },
    "aggregateRating": baseline.gbp_rating?.value ? {
      "@type": "AggregateRating",
      "ratingValue": baseline.gbp_rating.value,
      "reviewCount": baseline.gbp_review_count?.value || 0,
    } : undefined,
    "sameAs": [],
  }, null, 2);
}

function buildFaqSchemaJsonLd(industry) {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      { "@type": "Question", "name": `What does a ${industry || "service"} provider do?`,
        "acceptedAnswer": { "@type": "Answer", "text": "Replace with a 40–60 word direct answer to this question." } },
    ],
  }, null, 2);
}

// ═══════════════════════════════════════════════════════════════════════════════
// GEO MEASUREMENT — PROPRIETARY LOGIC (Doctor Fizz owns this; the AI engines are
// RAW SIGNAL only). Both functions are COLLECTOR-AGNOSTIC: they take raw per-engine
// AI responses (from the Playwright+Browserless collector, an API, or mock data)
// and turn them into Share-of-Voice and Citation intelligence.
//
// Raw response shape (what the collector must supply per AI answer):
//   { engine, prompt, answerText?, brandsMentioned?: string[], leadBrand?: string,
//     citations?: string[] (source URLs) }
// ═══════════════════════════════════════════════════════════════════════════════

const _geoNorm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const _geoHost = (url) => {
  try { return new URL(String(url).includes("://") ? url : `https://${url}`).hostname.replace(/^www\./, "").toLowerCase(); }
  catch { return String(url || "").replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].toLowerCase(); }
};
// Safe host match — exact host or sub-domain only. Avoids "acme.com" matching
// "notacme.com" / "acme.com.evil.com" (the substring-includes bug).
const _hostMatches = (hostOrUrl, domain) => {
  const h = _geoHost(hostOrUrl), d = _geoHost(domain);
  return !!d && d.length > 1 && (h === d || h.endsWith("." + d));
};
const _pct1 = (n, d) => Math.round((Number(n) / (Number(d) || 1)) * 1000) / 10;

// Current year — doctor-fizz-logic runs only inside Next.js routes (never a Workflow
// script), so new Date() is safe here. Falls back to a constant if it ever throws.
const _nowYear = () => { try { return new Date().getFullYear(); } catch { return 2026; } };
// The only date signal AI engines reliably expose is a 4-digit year embedded in the
// cited URL (e.g. /2026/, -2025-, ?y=2024). Returns 0 when none is present/plausible.
const _citationYear = (url) => {
  const cur = _nowYear();
  const m = String(url || "").match(/(?:^|[^0-9])(20[1-9][0-9])(?:[^0-9]|$)/);
  const y = m ? Number(m[1]) : 0;
  return y >= 2010 && y <= cur + 1 ? y : 0;
};
// §21 FRESHNESS (0-100) — real, from the dated citations across a response set: the
// share that are current-or-last-year. No dated citations → softer baseline, nudged up
// when the answers themselves reference a recent year. Honest proxy (engines rarely
// surface true publish dates) but data-driven, not a hard-coded 50.
const _computeFreshness = (responses = []) => {
  const cur = _nowYear();
  let dated = 0, recent = 0;
  for (const r of responses) for (const u of (r.citations || [])) {
    const y = _citationYear(u); if (y) { dated++; if (y >= cur - 1) recent++; }
  }
  if (dated >= 2) return Math.round((recent / dated) * 100);
  if (dated === 1) return recent ? 70 : 40;
  const txt = responses.map((r) => String(r.answerText || "")).join(" ");
  return new RegExp(`(?:^|[^0-9])(${cur}|${cur - 1})(?:[^0-9]|$)`).test(txt) ? 60 : 45;
};

/**
 * SHARE OF VOICE LOGIC — % visibility of each brand inside each AI engine, plus a
 * Doctor-Fizz-calculated Avg (ESTIMATE). A lead brand (the one the answer leads
 * with) is weighted higher than a passing mention. SOV is RELATIVE within the
 * supplied brand set. Returns null until raw responses exist.
 *
 * @param {object} input { brandSet: string[], client: string, responses: [] }
 */
export function buildShareOfVoice(input = {}) {
  const brandSet = (input.brandSet || []).filter(Boolean);
  const responses = input.responses || [];
  if (brandSet.length < 2 || !responses.length) return null;

  const client = input.client || brandSet[0];
  const clientN = _geoNorm(client);

  const mentionsOf = (r) => {
    if (Array.isArray(r.brandsMentioned) && r.brandsMentioned.length) {
      const set = new Set(r.brandsMentioned.map(_geoNorm));
      return brandSet.filter(b => set.has(_geoNorm(b)));
    }
    const text = _geoNorm(r.answerText || "");
    return text ? brandSet.filter(b => text.includes(_geoNorm(b))) : [];
  };
  // Lead brand: explicit, else the brand named earliest in the answer (works live).
  const leadOf = (r) => {
    if (r.leadBrand) return _geoNorm(r.leadBrand);
    const t = _geoNorm(r.answerText || "");
    if (!t) return "";
    let best = "", bestIdx = Infinity;
    for (const b of brandSet) { const i = t.indexOf(_geoNorm(b)); if (i >= 0 && i < bestIdx) { bestIdx = i; best = _geoNorm(b); } }
    return best;
  };

  const engines = [...new Set(responses.map(r => r.engine).filter(Boolean))];
  const byEngine = {};
  for (const engine of engines) {
    const rs = responses.filter(r => r.engine === engine);
    const counts = {}; brandSet.forEach(b => (counts[b] = 0));
    let total = 0;
    for (const r of rs) {
      const lead = leadOf(r);
      for (const b of mentionsOf(r)) {
        const w = lead === _geoNorm(b) ? 2 : 1;  // lead-weighting (proprietary)
        counts[b] += w; total += w;
      }
    }
    byEngine[engine] = {};
    for (const b of brandSet) byEngine[engine][b] = total > 0 ? (counts[b] / total) * 100 : 0;
  }

  const r1 = (x) => Math.round(x * 10) / 10;
  const by_brand = brandSet.map(b => {
    const row = { brand: b, is_client: _geoNorm(b) === clientN, per_engine: {} };
    let sum = 0;
    for (const e of engines) { const v = byEngine[e][b]; row.per_engine[e] = r1(v); sum += v; }
    row.avg = r1(engines.length ? sum / engines.length : 0);
    return row;
  }).sort((a, b) => b.avg - a.avg);

  const clientRow = by_brand.find(r => r.is_client);
  return {
    engines,
    by_brand,
    client_sov_avg: clientRow ? clientRow.avg : 0,
    estimate: true,
    note: "Share of Voice is relative within this brand set. Per-engine values come from the AI engines; the Avg column is calculated by Doctor Fizz (ESTIMATE).",
  };
}

const _GEO_DOMAIN_TYPES = [
  [/wikipedia\.org|wikidata\.org/, "Encyclopedia"],
  [/reddit\.com|quora\.com|stackexchange|forum/, "Community"],
  [/justdial|sulekha|indiamart|tradeindia|yelp|trustpilot|clutch\.co|goodfirms|g2\.com|glassdoor|yellowpages|designrush|foodierate|hargamenu|cuponation|hemat\.|katalogpromosi|kumparan/, "Aggregator / directory"],
  [/times|news|liputan|kompas|tribun|detik|cnbc|forbes|techcrunch|businessinsider|\.com\/(blog|news)|blog\./, "Media"],
];
function _geoClassifyDomain(domain, clientDomain, competitorDomains) {
  const d = String(domain || "").toLowerCase();
  if (_hostMatches(d, clientDomain)) return "Brand domain (you)";
  if ((competitorDomains || []).some(c => _hostMatches(d, c))) return "Brand domain (competitor)";
  for (const [re, label] of _GEO_DOMAIN_TYPES) if (re.test(d)) return label;
  return "Other";
}

/**
 * CITATION LOGIC — which source domains the AI engines cite, the citation gap
 * (is the client's own domain cited, vs competitors?), and brand presence per
 * prompt. Engines = raw signal; this aggregation + gap analysis is Doctor Fizz's.
 *
 * @param {object} input { clientDomain, clientName?, competitorDomains?: [], responses: [] }
 */
export function buildCitationAnalysis(input = {}) {
  const responses = input.responses || [];
  if (!responses.length) return null;
  const clientDomain = _geoHost(input.clientDomain || "");
  const competitorDomains = (input.competitorDomains || []).map(_geoHost).filter(Boolean);

  const agg = new Map();   // host -> { pages:Set, responses:int }
  for (const r of responses) {
    const cites = (r.citations || []).filter(Boolean);
    const seen = new Set();
    for (const url of cites) {
      const host = _geoHost(url);
      if (!host) continue;
      if (!agg.has(host)) agg.set(host, { domain: host, pages: new Set(), responses: 0 });
      const e = agg.get(host);
      e.pages.add(url);
      if (!seen.has(host)) { e.responses++; seen.add(host); }
    }
  }

  const most_cited_domains = [...agg.values()].map(e => ({
    domain: e.domain,
    pages_cited: e.pages.size,
    responses: e.responses,
    type: _geoClassifyDomain(e.domain, clientDomain, competitorDomains),
    is_client: _hostMatches(e.domain, clientDomain),
    is_competitor: competitorDomains.some(c => _hostMatches(e.domain, c)),
  })).sort((a, b) => b.responses - a.responses || b.pages_cited - a.pages_cited).slice(0, 12);

  const client_cited = most_cited_domains.some(d => d.is_client);
  const topComp = most_cited_domains.find(d => d.is_competitor);
  const who = input.clientName || clientDomain || "your domain";
  const citation_gap = client_cited
    ? `${who}'s own domain is already cited by AI engines — defend and expand the pages that earn it.`
    : topComp
      ? `${clientDomain || "Your domain"} is absent from the top cited domains, while ${topComp.domain} (a competitor) is cited at scale (${topComp.responses} responses). A brand domain CAN be cited — build the citable pages.`
      : `${clientDomain || "Your domain"} is not yet cited; AI cites third-party media and aggregators instead. Build citable pages and earn coverage on the exact sources AI already trusts.`;

  const brand_presence = responses.slice(0, 10).map(r => ({
    prompt: r.prompt || "",
    brands_surfaced: r.brandsMentioned || [],
    client_present: (r.brandsMentioned || []).some(b => _geoNorm(b).includes(_geoNorm(input.clientName || ""))),
    sources_cited: [...new Set((r.citations || []).map(_geoHost).filter(Boolean))].slice(0, 4),
  }));

  // §24 — classify every cited domain into a link-opportunity, and build the queue.
  const classified = most_cited_domains.map(d => ({ ...d, ...classifyCitation(d.domain, { clientDomain, competitorDomains }) }));
  const opportunity_queue = classified
    .filter(d => !d.is_client && d.action_type !== "no_action" && d.action_type !== "citation_only" && d.link_opportunity_score > 0)
    .sort((a, b) => b.link_opportunity_score - a.link_opportunity_score)
    .slice(0, 10)
    .map(d => ({
      domain: d.domain, citation_class: d.citation_class, source_type: d.source_type,
      action: d.action_type, opportunity_score: d.link_opportunity_score,
      difficulty: d.link_acquisition_difficulty, cited_in_responses: d.responses,
    }));

  // §23 — PER-CITATION store: every cited URL classified individually (page-level),
  // not just aggregated by domain. Powers page-level opportunity targeting, cross-engine
  // counting, and per-citation freshness — the spec's deeper citation layer.
  const perCite = new Map();   // url -> record
  responses.forEach((r) => {
    (r.citations || []).filter(Boolean).forEach((url, i) => {
      const host = _geoHost(url); if (!host) return;
      if (!perCite.has(url)) {
        const cl = classifyCitation(url, { clientDomain, competitorDomains });
        perCite.set(url, {
          url, domain: host, engine: r.engine || "", prompt: r.prompt || "",
          first_position: i + 1, published_year: _citationYear(url) || null,
          is_client: _hostMatches(host, clientDomain),
          is_competitor: competitorDomains.some((c) => _hostMatches(host, c)),
          citation_class: cl.citation_class, source_type: cl.source_type,
          action: cl.action_type, opportunity_score: cl.link_opportunity_score,
          difficulty: cl.link_acquisition_difficulty, authority_score: cl.authority_score,
          _engines: new Set([r.engine].filter(Boolean)), times_cited: 1,
        });
      } else {
        const e = perCite.get(url); e.times_cited++; if (r.engine) e._engines.add(r.engine);
      }
    });
  });
  const citations = [...perCite.values()]
    .map(({ _engines, ...c }) => ({ ...c, engines: [..._engines], cross_engine: _engines.size }))
    .sort((a, b) => b.cross_engine - a.cross_engine || b.opportunity_score - a.opportunity_score);
  // Page-level (URL) opportunity queue — complements the domain-level one above.
  const page_opportunities = citations
    .filter((c) => !c.is_client && c.action !== "no_action" && c.action !== "citation_only" && c.opportunity_score > 0)
    .sort((a, b) => b.opportunity_score - a.opportunity_score || b.cross_engine - a.cross_engine)
    .slice(0, 10);
  const freshness = _computeFreshness(responses);   // §21 real freshness signal

  return {
    most_cited_domains: classified, client_cited, citation_gap, brand_presence,
    opportunity_queue,                       // §23-24 domain-level backlink/citation queue
    citations: citations.slice(0, 60),       // §23 per-citation (page-level) store
    page_opportunities,                      // §24 page-level opportunity queue
    freshness,                               // §21 measured freshness (feeds the GEO score)
    responses_analysed: responses.length,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// §24 CITATION → OPPORTUNITY CLASSIFICATION (rule-based; the spec's "most important
// new logic"). Each cited URL becomes a typed link/citation opportunity with a clear
// next action — turning the GEO citation layer into a backlink-discovery engine.
// ═══════════════════════════════════════════════════════════════════════════════
// Authority proxy (0-100) per class — high-trust sources score higher.
const _CLASS_AUTHORITY = {
  brand_page: 100, wikipedia: 95, government: 95, pr_news: 85, educational: 85,
  review_site: 80, social_media: 75, business_directory: 75, listings: 72,
  marketplace: 70, competitor_page: 70, reddit: 70, partner_page: 62,
  forums: 60, communities: 60, comparison_page: 58, resource_page: 56, blog: 50, unknown: 40,
};
// HOST rules: [hostRegex, class, source_type, opportunity_score, difficulty, editorial_control, action_type]
const _CITATION_HOST_RULES = [
  [/(?:^|\.)wikipedia\.org$|(?:^|\.)wikidata\.org$/,                         "wikipedia",          "Encyclopedia",     70, "hard",   "community", "request_correction"],
  [/(?:^|\.)reddit\.com$/,                                                    "reddit",             "Community",        75, "medium", "community", "outreach"],
  [/(?:^|\.)(quora|stackexchange|stackoverflow|discord|slack)\.[a-z]/,        "communities",        "Community / forum",62, "medium", "community", "outreach"],
  [/(?:^|\.)(facebook|instagram|twitter|x|linkedin|youtube|tiktok|pinterest)\.com$/, "social_media", "Social",     60, "easy",   "self",      "claim_listing"],
  [/(?:^|\.)(justdial|sulekha|indiamart|tradeindia|yellowpages|yelp|foursquare|99acres|urbanpro)\.[a-z]/, "business_directory", "Directory", 85, "easy", "self", "claim_listing"],
  [/(?:^|\.)(trustpilot|g2|capterra|getapp|clutch|goodfirms|glassdoor|designrush|ambitionbox|mouthshut)\.[a-z]/, "review_site", "Review platform", 88, "easy", "self", "claim_listing"],
  [/(?:^|\.)(producthunt|crunchbase|angellist|wellfound)\.[a-z]/,             "listings",           "Listing site",     80, "easy",   "self",      "claim_listing"],
  [/(?:^|\.)(amazon|flipkart|etsy|ebay|meesho)\.[a-z]/,                       "marketplace",        "Marketplace",      50, "medium", "self",      "create_backlink_target"],
  [/(?:^|\.)(forbes|techcrunch|businessinsider|economictimes|livemint|yourstory|inc42|hindustantimes|timesofindia|cnbc|reuters|bloomberg|entrepreneur|mashable|theverge)\.[a-z]/, "pr_news", "News / PR", 82, "hard", "editorial", "outreach"],
  [/\.edu(\.|$)|\.ac\.[a-z]|(?:^|\.)(coursera|udemy|edx)\.[a-z]/,             "educational",        "Education",        55, "hard",   "editorial", "build_similar_page"],
  [/\.gov(\.|$)|(?:^|\.)gov\.[a-z]|(?:^|\.)nic\.in$/,                         "government",         "Government",       45, "hard",   "editorial", "request_correction"],
  [/(?:^|\.)(medium|substack)\.com$|(?:^|\.)(wordpress|blogspot)\.com$|(?:^|\.)blog\./, "blog",      "Blog",             70, "medium", "editorial", "outreach"],
];
// PATH rules (tested on the URL path only — never the host, to avoid host false-positives):
const _CITATION_PATH_RULES = [
  [/\/(compare|comparison|alternatives?)(\/|-|$)|[-/]vs[-/]|\/vs(\/|$)/,      "comparison_page",    "Comparison",       78, "medium", "editorial", "build_similar_page"],
  [/\/partners?(\/|-|$)|\/partner-with/,                                      "partner_page",       "Partner page",     72, "medium", "editorial", "outreach"],
  [/\/(resources?|guides?|tools?|directory|listings?)(\/|$)/,                 "resource_page",      "Resource page",    66, "medium", "editorial", "create_backlink_target"],
];

export function classifyCitation(url, { clientDomain = "", competitorDomains = [] } = {}) {
  const host = _geoHost(url);
  let path = "";
  try { path = new URL(String(url).includes("://") ? url : `https://${url}`).pathname.toLowerCase(); }
  catch { path = "/" + String(url || "").toLowerCase().replace(/^[^/]*\/?/, ""); }
  const out = (cls, src, score, diff, ctrl, action, rel = 70) => ({
    domain: host, citation_class: cls, source_type: src, link_opportunity_score: score,
    link_acquisition_difficulty: diff, editorial_control: ctrl, relevance_score: rel,
    authority_score: _CLASS_AUTHORITY[cls] ?? 40, action_type: action,
  });
  if (clientDomain && _hostMatches(host, clientDomain))
    return out("brand_page", "Your site", 0, "owned", "self", "citation_only", 100);
  if ((competitorDomains || []).some((c) => _hostMatches(host, c)))
    return out("competitor_page", "Competitor", 25, "hard", "none", "build_similar_page", 85);
  for (const [re, cls, src, score, diff, ctrl, action] of _CITATION_HOST_RULES)
    if (re.test(host)) return out(cls, src, score, diff, ctrl, action);
  for (const [re, cls, src, score, diff, ctrl, action] of _CITATION_PATH_RULES)
    if (re.test(path)) return out(cls, src, score, diff, ctrl, action);
  return out("unknown", "Other", 45, "medium", "unknown", "monitor", 50);
}

// ═══════════════════════════════════════════════════════════════════════════════
// §21 WEIGHTED GEO SCORE — composite 0-100 from the measured signals.
//   30% citation presence · 20% brand presence · 15% citation position ·
//   15% intent match · 10% cross-engine consistency · 5% freshness · 5% topic coverage
// ═══════════════════════════════════════════════════════════════════════════════
export function computeGeoScore({ share_of_voice = null, citation_analysis = null } = {}) {
  if (!share_of_voice && !citation_analysis) return null;
  const sov = share_of_voice || {};
  const cites = citation_analysis || {};
  const clientRow = (sov.by_brand || []).find(b => b.is_client) || null;
  const engines = sov.engines || [];

  // citation presence — is the brand's own domain cited at all?
  const citationPresence = cites.client_cited ? 100 : 0;
  // brand presence — relative SoV inside the answers (0-100 already)
  const brandPresence = clientRow ? clientRow.avg : 0;
  // citation position — rank of the brand's domain among cited domains (earlier = better)
  const idx = (cites.most_cited_domains || []).findIndex(d => d.is_client);
  const citationPosition = idx >= 0 ? Math.max(0, 100 - idx * 12) : 0;
  // intent match — share of prompts where the brand surfaced at all
  const bp = cites.brand_presence || [];
  const intentMatch = bp.length ? Math.round((bp.filter(p => p.client_present).length / bp.length) * 100) : brandPresence;
  // cross-engine consistency — appears in how many engines (of those scanned)
  const enginesPresent = clientRow ? engines.filter(e => (clientRow.per_engine[e] || 0) > 0).length : 0;
  const crossEngine = engines.length ? Math.round((enginesPresent / engines.length) * 100) : 0;
  // freshness — measured from dated citations (see _computeFreshness); 50 only if absent
  const freshness = (typeof cites.freshness === "number") ? cites.freshness : 50;
  // topic coverage — same prompt-coverage proxy as intent for now
  const topicCoverage = intentMatch;

  const score = Math.round(
    0.30 * citationPresence + 0.20 * brandPresence + 0.15 * citationPosition +
    0.15 * intentMatch + 0.10 * crossEngine + 0.05 * freshness + 0.05 * topicCoverage
  );
  const band = score >= 70 ? "Strong" : score >= 40 ? "Developing" : score >= 15 ? "Emerging" : "Invisible";
  return {
    score, band,
    breakdown: {
      citation_presence: Math.round(citationPresence), brand_presence: Math.round(brandPresence),
      citation_position: Math.round(citationPosition), intent_match: Math.round(intentMatch),
      cross_engine_consistency: crossEngine, freshness, topic_coverage: Math.round(topicCoverage),
    },
    note: "Weighted composite (30% citation presence, 20% brand presence, 15% citation position, 15% intent match, 10% cross-engine consistency, 5% freshness, 5% topic coverage).",
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// §20 — FULL TWO-LAYER GEO METRICS (Layer A = overall, Layer B = per engine).
// Every dimension computed for the brand AND competitors, from the raw multi-engine
// responses: mentions, citations, SoV, citation score, citation-position score, topic
// coverage, intent match, freshness, and a per-engine GEO score. "One of the most
// important reporting refinements" in the spec — overall average + per-engine split.
// ═══════════════════════════════════════════════════════════════════════════════
export function buildGeoMetrics(input = {}) {
  const responses = input.responses || [];
  const brandSet = (input.brandSet || []).filter(Boolean);
  if (!responses.length || !brandSet.length) return null;

  const r1 = (x) => Math.round(x * 10) / 10;
  const client = input.client || brandSet[0];
  const clientN = _geoNorm(client);
  const clientDomain = _geoHost(input.clientDomain || "");
  const competitorDomains = (input.competitorDomains || []).map(_geoHost).filter(Boolean);
  const engines = [...new Set(responses.map((r) => r.engine).filter(Boolean))];

  const mentionsIn = (r) => {
    if (Array.isArray(r.brandsMentioned) && r.brandsMentioned.length) {
      const set = new Set(r.brandsMentioned.map(_geoNorm));
      return brandSet.filter((b) => set.has(_geoNorm(b)));
    }
    const t = _geoNorm(r.answerText || "");
    return t ? brandSet.filter((b) => t.includes(_geoNorm(b))) : [];
  };
  // Lead brand = explicit leadBrand if the live adapter set one, else the brand named
  // EARLIEST in the answer text (so lead-weighting works for real scans too).
  const leadOf = (r) => {
    if (r.leadBrand) return _geoNorm(r.leadBrand);
    const t = _geoNorm(r.answerText || "");
    if (!t) return "";
    let best = "", bestIdx = Infinity;
    for (const b of brandSet) { const i = t.indexOf(_geoNorm(b)); if (i >= 0 && i < bestIdx) { bestIdx = i; best = _geoNorm(b); } }
    return best;
  };
  const hostsIn = (r) => (r.citations || []).map(_geoHost).filter(Boolean);
  const citePos = (r, targets) => {
    const hosts = hostsIn(r);
    for (let i = 0; i < hosts.length; i++) if (targets.some((d) => _hostMatches(hosts[i], d))) return i + 1;
    return 0;
  };

  const compute = (rs) => {
    const n = rs.length || 1;
    let bMent = 0, bCit = 0, cMentResp = 0, cCitResp = 0, mw = 0, cw = 0, compw = 0, citScore = 0, posSum = 0, posCount = 0, totalCites = 0;
    const themes = new Set(), sourceHosts = new Set(), sourceTypes = new Set();
    for (const r of rs) {
      const ms = mentionsIn(r), lead = leadOf(r);
      if (ms.some((b) => _geoNorm(b) === clientN)) { bMent++; themes.add(String(r.prompt || "")); }
      if (ms.some((b) => _geoNorm(b) !== clientN)) cMentResp++;            // §20: prompts WITH a competitor mention (response-count, comparable to brand)
      for (const b of ms) {
        const w = lead === _geoNorm(b) ? 2 : 1;                            // lead-weighted SoV (occurrence weights)
        mw += w;
        if (_geoNorm(b) === clientN) cw += w; else compw += w;
      }
      const cp = citePos(r, [clientDomain].filter(Boolean));
      if (cp > 0) { bCit++; posSum += cp; posCount++; citScore += 1 / cp; }
      if (hostsIn(r).some((h) => competitorDomains.some((d) => _hostMatches(h, d)))) cCitResp++; // prompts citing a competitor
      for (const h of hostsIn(r)) { sourceHosts.add(h); sourceTypes.add(_geoClassifyDomain(h, clientDomain, competitorDomains)); totalCites++; }
    }
    return {
      prompts: rs.length,
      brand_mentions: bMent, brand_mention_rate: r1((bMent / n) * 100), brand_citations: bCit,
      competitor_mentions: cMentResp, competitor_citations: cCitResp,
      sov: r1(mw > 0 ? (cw / mw) * 100 : 0), competitor_sov: r1(mw > 0 ? (compw / mw) * 100 : 0),
      citation_score: r1((citScore / n) * 100),
      citation_position_score: r1(posCount ? Math.max(0, 100 - (posSum / posCount - 1) * 20) : 0),
      topic_coverage: r1((themes.size / n) * 100), intent_match: r1((bMent / n) * 100), freshness: _computeFreshness(rs),
      source_diversity: sourceHosts.size, source_type_diversity: sourceTypes.size, citation_count: totalCites,
    };
  };
  const scoreOf = (m, crossEngine) => Math.round(
    0.30 * (m.brand_citations > 0 ? 100 : 0) + 0.20 * m.sov + 0.15 * m.citation_position_score +
    0.15 * m.intent_match + 0.10 * crossEngine + 0.05 * m.freshness + 0.05 * m.topic_coverage
  );

  const by_engine = {};
  for (const e of engines) {
    const m = compute(responses.filter((r) => r.engine === e));
    m.geo_score = scoreOf(m, m.brand_mentions > 0 ? 100 : 0);
    by_engine[e] = m;
  }
  const overall = compute(responses);
  const enginesPresent = engines.filter((e) => (by_engine[e].brand_mentions || 0) > 0).length;
  overall.cross_engine_consistency = engines.length ? Math.round((enginesPresent / engines.length) * 100) : 0;
  overall.geo_score = scoreOf(overall, overall.cross_engine_consistency);

  return {
    engines, overall, by_engine,
    metric_keys: ["sov", "brand_mentions", "brand_citations", "competitor_sov", "competitor_mentions", "competitor_citations", "citation_score", "citation_position_score", "topic_coverage", "intent_match", "geo_score"],
    note: "Layer A = overall across all engines; Layer B = per-engine split. Computed from the live multi-engine scan.",
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// §25 — DETERMINISTIC TOPIC DOMINANCE. For each prompt (topic): which brand each AI
// engine leads with, who appears, and which competitor dominates the most topics.
// Reproducible hard numbers that complement Claude's qualitative geo_insights.
//   • lost_topics    = a competitor leads a topic where YOU are absent (highest priority)
//   • contested_topics = you appear but a competitor still leads
// ═══════════════════════════════════════════════════════════════════════════════
export function buildTopicDominance(input = {}) {
  const brandSet = (input.brandSet || []).filter(Boolean);
  const responses = input.responses || [];
  if (brandSet.length < 2 || !responses.length) return null;
  const client = input.client || brandSet[0];
  const clientN = _geoNorm(client);

  const mentionsIn = (r) => {
    if (Array.isArray(r.brandsMentioned) && r.brandsMentioned.length) {
      const set = new Set(r.brandsMentioned.map(_geoNorm));
      return brandSet.filter((b) => set.has(_geoNorm(b)));
    }
    const t = _geoNorm(r.answerText || "");
    return t ? brandSet.filter((b) => t.includes(_geoNorm(b))) : [];
  };
  const leadOf = (r) => {
    if (r.leadBrand) { const m = brandSet.find((b) => _geoNorm(b) === _geoNorm(r.leadBrand)); if (m) return m; }
    const t = _geoNorm(r.answerText || ""); if (!t) return "";
    let best = "", bi = Infinity;
    for (const b of brandSet) { const i = t.indexOf(_geoNorm(b)); if (i >= 0 && i < bi) { bi = i; best = b; } }
    return best;
  };

  const byTopic = new Map();
  for (const r of responses) {
    const key = String(r.prompt || "").trim().toLowerCase();
    if (!byTopic.has(key)) byTopic.set(key, []);
    byTopic.get(key).push(r);
  }
  const led = {}, present = {};
  brandSet.forEach((b) => { led[b] = 0; present[b] = 0; });
  const topics = [];
  for (const [prompt, rs] of byTopic) {
    const leadVotes = {}, presentSet = new Set();
    for (const r of rs) {
      const l = leadOf(r); if (l) leadVotes[l] = (leadVotes[l] || 0) + 1;
      for (const b of mentionsIn(r)) presentSet.add(b);
    }
    const lead = Object.entries(leadVotes).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
    if (lead) led[lead] = (led[lead] || 0) + 1;
    for (const b of presentSet) present[b] = (present[b] || 0) + 1;
    const clientPresent = [...presentSet].some((b) => _geoNorm(b) === clientN);
    topics.push({ topic: prompt, lead, brands_present: [...presentSet], client_present: clientPresent, client_lead: _geoNorm(lead) === clientN });
  }
  const total = topics.length;
  const competitor_dominance = brandSet.filter((b) => _geoNorm(b) !== clientN)
    .map((b) => ({ brand: b, topics_led: led[b] || 0, topics_present: present[b] || 0, lead_share: _pct1(led[b] || 0, total) }))
    .sort((a, b) => b.topics_led - a.topics_led || b.topics_present - a.topics_present);
  return {
    total_topics: total,
    client_topics_led: led[client] || 0,
    client_topics_present: present[client] || 0,
    client_lead_share: _pct1(led[client] || 0, total),
    competitor_dominance,
    lost_topics: topics.filter((t) => !t.client_present && t.lead).map((t) => ({ topic: t.topic, lead: t.lead })).slice(0, 12),
    contested_topics: topics.filter((t) => t.client_present && !t.client_lead && t.lead).map((t) => ({ topic: t.topic, lead: t.lead })).slice(0, 12),
    topics: topics.slice(0, 20),
    note: "Per-topic dominance: which brand each AI engine leads with. Lost = a competitor leads a topic where you are absent; contested = you appear but a competitor leads.",
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PRIORITY ACTION PLAN (Section 02 — impact-to-effort ranked, 3 tiers)
// ═══════════════════════════════════════════════════════════════════════════════

const EFFORT_HOURS = { "≈15 min": 0.25, "≈5 minutes": 0.1, "≈10 minutes": 0.17, "≈20 minutes": 0.33, "≈30 min": 0.5, "≈1 hour": 1, "≈2 hours": 2, "≈3 hours": 3, "≈1 day": 8, "≈1 week": 40, "≈2 weeks": 80 };
function effortToHours(e) {
  if (!e) return 4;
  const k = Object.keys(EFFORT_HOURS).find(x => String(e).includes(x.replace("≈", "")));
  if (k) return EFFORT_HOURS[k];
  const m = String(e).match(/([0-9.]+)\s*(min|hour|day|week)/i);
  if (!m) return 4;
  const n = parseFloat(m[1]); const u = m[2].toLowerCase();
  return u.startsWith("min") ? n / 60 : u.startsWith("hour") ? n : u.startsWith("day") ? n * 8 : n * 40;
}
const PRIORITY_IMPACT = { CRITICAL: 5, HIGH: 4, MEDIUM: 2.5, "QUICK WIN": 2, LOW: 1 };

/**
 * Build the section-02 priority action plan: every major action ranked by
 * impact-to-effort, grouped into three tiers. (spec Part 3 + Part 5 §02)
 */
export function buildPriorityActionPlan({ technical_issues = [], content_architecture = {}, backlinks = {}, geo_and_ai_visibility = {}, gbp_comparison = {} }) {
  const actions = [];
  // Each action carries `why` — the specific finding/metric that justifies it,
  // so no recommendation is arbitrary (it is always tied to evidence + impact).
  const add = (tier, description, channel, priority, effort, why = "") =>
    actions.push({ tier, description, channel, priority, effort, why, _impact: PRIORITY_IMPACT[priority] || 2, _hours: effortToHours(effort) });

  // ── Tier 1: Foundation fixes (technical blockers gate everything) ──
  for (const t of technical_issues) {
    if (t.priority === "CRITICAL" || t.priority === "HIGH") {
      add("Foundation Fixes", t.issue + " — " + (t.recommended_action || "").split(".")[0], "SEO", t.priority, t.estimated_effort,
        t.why_it_matters || t.expected_unlock || "Search engines read this technical signal before they read the content, so it caps every page above it.");
    }
  }

  // ── Tier 2: Content & on-page work ──
  for (const p of (content_architecture.commercial_pages || []).slice(0, 4)) {
    add("Content & On-Page Work", `Build commercial page: ${p.page_name} (${p.url_slug}) targeting "${p.keyword_cluster}"`, "SEO", p.priority === "HIGH" ? "HIGH" : "MEDIUM", "≈1 week",
      `Targets uncaptured commercial demand for "${p.keyword_cluster}"${p.primary_volume ? ` (~${Number(p.primary_volume).toLocaleString()} searches/mo)` : ""} — no page currently ranks for it.`);
  }
  for (const p of (content_architecture.geography_pages || content_architecture.city_pages || []).slice(0, 3)) {
    const where = p.geo_target || p.city_target;
    add("Content & On-Page Work", `Create ${(p.page_type || "geography page").toLowerCase()}${where ? ` for ${where}` : ""}: "${p.keyword_cluster}"`, "SEO", "MEDIUM", "≈3 hours",
      `Captures local "near me" demand${where ? ` in ${where}` : ""} that a generic page cannot win.`);
  }
  for (const p of (content_architecture.blog_and_guides || []).slice(0, 3)) {
    add("Content & On-Page Work", `Publish guide: "${p.proposed_title}"`, "SEO", "MEDIUM", "≈1 week",
      "Builds topical authority and earns informational + AI-answer traffic that links into the commercial pages.");
  }

  // ── Tier 3: Authority & GEO work ──
  const missingCitations = (backlinks.citation_links || []).filter(l => !l.client_listed).slice(0, 5);
  if (missingCitations.length) {
    add("Authority & GEO Work", `Claim ${missingCitations.length} missing citation listings (${missingCitations.map(l => l.platform).join(", ")})`, "SEO", "QUICK WIN", "≈3 hours",
      "These directories are placement targets where competitors are already listed — fast, free authority and local-ranking signals.");
  }
  for (const l of (backlinks.editorial_links || []).slice(0, 2)) {
    add("Authority & GEO Work", `Editorial link: ${l.content_asset}`, "SEO", "MEDIUM", l.effort || "≈2 weeks",
      "Earns a high-value editorial link to close the referring-domain diversity gap against competitors.");
  }
  for (const g of (backlinks.competitor_gap || []).slice(0, 2)) {
    add("Authority & GEO Work", `Pursue competitor-gap link from ${g.referring_domain}`, "SEO", "MEDIUM", "≈1 week",
      `${g.referring_domain} already links to a competitor but not to you — a proven, reachable link target.`);
  }
  if ((geo_and_ai_visibility.schema_additions || []).length) {
    add("Authority & GEO Work", `Implement ${geo_and_ai_visibility.schema_additions.map(s => s.type).join(" + ")} JSON-LD for AI citation`, "SEO+GEO", "HIGH", "≈3 hours",
      "Makes the pages eligible for AI Overviews and answer-engine citation — the schema AI engines read to identify the business.");
  }
  for (const a of (geo_and_ai_visibility.recommended_actions || []).slice(0, 2)) {
    add("Authority & GEO Work", a.split(".")[0], "GEO", "MEDIUM", "≈1 day",
      "Improves AI-answer readiness so the content becomes quotable by ChatGPT, Gemini and Perplexity.");
  }
  if (gbp_comparison?.client && gbp_comparison.fastest_win) {
    add("Authority & GEO Work", `GBP fastest win: ${gbp_comparison.fastest_win.split(".")[0]}`, "SEO", "QUICK WIN", "≈30 min",
      gbp_comparison.fastest_win);
  }

  // Rank within each tier by impact-to-effort (higher = do first)
  const score = (a) => a._impact / Math.max(0.1, a._hours);
  const tiers = ["Foundation Fixes", "Content & On-Page Work", "Authority & GEO Work"];
  const grouped = tiers.map(tier => ({
    tier,
    actions: actions.filter(a => a.tier === tier).sort((x, y) => score(y) - score(x))
      .map(({ _impact, _hours, ...rest }) => rest),
  })).filter(g => g.actions.length);

  return grouped;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEO SCORES (Phase 3 — Deep AI Analysis Engine)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Compute the six headline scores deterministically from collected data.
 * Each is 0-100. The SEO Health Score is a weighted composite of the others.
 * Returns { seo_health, technical, content, authority, local, competitive, breakdown }.
 */
export function computeScores(input = {}) {
  const { baseline = {}, crawlData = null, gmbData = null, gbpComparison = null, contentData = null } = input;

  const val = (k) => baseline[k]?.value ?? null;
  const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));

  // ── Technical: crawl health + PSI + indexability ──
  let technical = 0, techParts = 0;
  if (crawlData?.healthScore != null) { technical += crawlData.healthScore; techParts++; }
  const mob = val("mobile_performance_score");
  const desk = val("desktop_performance_score");
  if (mob != null)  { technical += mob;  techParts++; }
  if (desk != null) { technical += desk; techParts++; }
  if (crawlData) {
    let t = 100;
    if (!crawlData.hasSitemap)            t -= 10;
    if (crawlData.crawlBlockedByRobots)   t -= 30;
    if (!(crawlData.summary?.pagesWithSchemaTypes || []).length) t -= 10;
    if ((crawlData.brokenLinks || []).length) t -= 10;
    technical += clamp(t); techParts++;
  }
  technical = techParts ? clamp(technical / techParts) : null;

  // ── Content: word count, thin pages, meta completeness ──
  let content = null;
  if (crawlData) {
    const s = crawlData.summary || {};
    let c = 100;
    const avgWords = s.avgWordCount || 0;
    if (avgWords < 300)      c -= 25;
    else if (avgWords < 600) c -= 10;
    if ((s.thinContentCount || 0) > 0)     c -= Math.min(20, s.thinContentCount * 2);
    if ((s.pagesMissingMetaTitle || 0) > 0) c -= Math.min(15, s.pagesMissingMetaTitle * 2);
    if ((s.pagesMissingMetaDesc || 0) > 0)  c -= Math.min(10, s.pagesMissingMetaDesc);
    if ((s.pagesMissingH1 || 0) > 0)        c -= Math.min(15, s.pagesMissingH1 * 3);
    content = clamp(c);
  }

  // ── Authority: DR + referring domains + backlinks ──
  let authority = null;
  const dr = val("domain_rating");
  const rd = val("referring_domains");
  if (dr != null || rd != null) {
    let a = 0, parts = 0;
    if (dr != null) { a += Math.min(100, Math.max(0, dr)); parts++; }
    if (rd != null) { a += Math.min(100, Math.log10(Math.max(0, rd) + 1) * 33); parts++; } // 10→33, 100→66, 1000→100
    authority = parts ? clamp(a / parts) : null;
  }

  // ── Local: GMB completeness + reviews + rating + directories ──
  let local = null;
  if (gmbData) {
    let l = 0, parts = 0;
    if (gmbData.completeness?.score != null) { l += gmbData.completeness.score; parts++; }
    const reviews = gmbData.gmb?.reviewCount ?? gmbData.reviewCount ?? 0;
    l += Math.min(100, reviews * 2); parts++; // 50 reviews → 100
    const rating = gmbData.gmb?.rating ?? 0;
    if (rating) { l += (rating / 5) * 100; parts++; }
    const dirs = gmbData.listedDirectoryCount ?? 0;
    l += Math.min(100, dirs * 20); parts++; // 5 dirs → 100
    local = parts ? clamp(l / parts) : null;
  }

  // ── Competitive: how the client stacks vs competitors (GBP + authority proxy) ──
  let competitive = null;
  if (gbpComparison?.has_competitor_data) {
    const client = gbpComparison.client || {};
    const comps  = gbpComparison.competitors || [];
    if (comps.length) {
      const clientReviews = client.review_count || 0;
      const avgCompReviews = comps.reduce((s, c) => s + (c.review_count || 0), 0) / comps.length;
      const reviewRatio = avgCompReviews > 0 ? clientReviews / avgCompReviews : 1;
      const clientComplete = client.completeness || 0;
      const avgCompComplete = comps.reduce((s, c) => s + (c.completeness || 0), 0) / comps.length || 1;
      const completeRatio = clientComplete / avgCompComplete;
      competitive = clamp(((reviewRatio * 0.5) + (completeRatio * 0.5)) * 100);
    }
  }

  // ── SEO Health: weighted composite of available scores ──
  const weights = { technical: 0.3, content: 0.2, authority: 0.25, local: 0.15, competitive: 0.1 };
  let healthSum = 0, weightSum = 0;
  const scores = { technical, content, authority, local, competitive };
  for (const [k, w] of Object.entries(weights)) {
    if (scores[k] != null) { healthSum += scores[k] * w; weightSum += w; }
  }
  const seo_health = weightSum ? clamp(healthSum / weightSum) : null;

  return {
    seo_health,
    technical,
    content,
    authority,
    local,
    competitive,
    grade: gradeForScore(seo_health),
  };
}

function gradeForScore(s) {
  if (s == null) return null;
  if (s >= 90) return "A";
  if (s >= 80) return "B";
  if (s >= 70) return "C";
  if (s >= 60) return "D";
  return "F";
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPETITOR BRAND EXTRACTION (helper for Problem 2)
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// V3 COMPETITOR LOGIC — categories + validation gate (Part 4)
// ═══════════════════════════════════════════════════════════════════════════════
// V3 requires four formal competitor categories and a hard rule that only
// validated BUSINESS competitors enter direct comparison. Search competitors and
// platform interceptors (directories, marketplaces, review sites, publishers,
// aggregators) are confined to search-context sections only.

// Known platform-interceptor domains + generic patterns. A domain matching any of
// these is a directory/marketplace/review/publisher/aggregator — never a direct rival.
const PLATFORM_INTERCEPTOR_DOMAINS = [
  // directories / B2B listings
  "justdial.com", "sulekha.com", "indiamart.com", "tradeindia.com", "yellowpages.in", "yellowpages.com",
  // review / rating aggregators
  "yelp.com", "trustpilot.com", "glassdoor.com", "clutch.co", "goodfirms.co", "g2.com", "capterra.com",
  "designrush.com", "ambitionbox.com", "mouthshut.com",
  // marketplaces
  "amazon.com", "amazon.in", "flipkart.com", "alibaba.com", "etsy.com", "indiamart.com", "ebay.com",
  // maps / social citation surfaces
  "google.com", "facebook.com", "instagram.com", "linkedin.com", "youtube.com", "twitter.com", "x.com",
  // publishers / encyclopaedias / Q&A / forums
  "wikipedia.org", "quora.com", "reddit.com", "medium.com", "youtube.com",
  "forbes.com", "businessinsider.com", "techcrunch.com", "entrepreneur.com", "inc.com",
];
// Substring signals that mark a generic directory / aggregator even on an unknown TLD.
const PLATFORM_INTERCEPTOR_SIGNALS = [
  "directory", "listings", "topratedlocal", "bestof", "reviews", "aggregat", "marketplace",
  "yellowpages", "justdial", "sulekha", "clutch", "goodfirms",
];

function bareHost(domainOrName) {
  return String(domainOrName || "")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .trim();
}

/**
 * Classify a single competitor entry into a V3 category.
 * Returns "platform_interceptor" | "search" | "direct_business".
 * @param {object|string} c        competitor (domain string or {name,domain})
 * @param {object} ctx             { sourceBucket: "business"|"search" }
 */
export function classifyCompetitor(c, ctx = {}) {
  const host = bareHost(typeof c === "string" ? c : (c?.domain || c?.name || ""));
  // 1. Platform interceptor — directory/marketplace/review/publisher/aggregator.
  const isPlatform =
    PLATFORM_INTERCEPTOR_DOMAINS.some(d => host === d || host.endsWith("." + d) || host.includes(d.split(".")[0] + ".")) ||
    PLATFORM_INTERCEPTOR_SIGNALS.some(s => host.includes(s));
  if (isPlatform) return "platform_interceptor";
  // 2. Came from the SEARCH bucket → search competitor (SERP context only).
  if (ctx.sourceBucket === "search") return "search";
  // 3. Came from the BUSINESS bucket and is not a platform → validated business competitor.
  return "direct_business";
}

/**
 * Segment competitor inputs into the two V3 strategic buckets:
 *   - validated_business: eligible for direct comparison / keyword gap / GBP / overtake
 *   - search_landscape:   search competitors + platform interceptors (context only)
 *
 * Accepts the separated input lists from Step 5 (businessCompetitors /
 * searchCompetitors). Falls back to treating a flat `competitors` list as business.
 *
 * @returns {{ validated_business: object[], search_landscape: object[],
 *             validatedDomains: Set<string> }}
 */
export function segmentCompetitors({ businessCompetitors = [], searchCompetitors = [], competitors = [] } = {}) {
  const biz = businessCompetitors.length || searchCompetitors.length ? businessCompetitors : competitors;
  const validated_business = [];
  const search_landscape = [];
  const seen = new Set();

  const toObj = (c, category) => {
    const name = typeof c === "string" ? c : (c?.name || c?.domain || "");
    const domain = bareHost(typeof c === "string" ? c : (c?.domain || c?.name || ""));
    return { name, domain, competitor_type: category };
  };

  // Business bucket → validated business UNLESS detected as a platform interceptor.
  for (const c of biz || []) {
    const domain = bareHost(typeof c === "string" ? c : (c?.domain || c?.name || ""));
    if (!domain || seen.has(domain)) continue;
    seen.add(domain);
    const category = classifyCompetitor(c, { sourceBucket: "business" });
    if (category === "direct_business") validated_business.push(toObj(c, "direct_business"));
    else search_landscape.push(toObj(c, "platform_interceptor"));
  }
  // Search bucket → search competitors / platform interceptors (never direct comparison).
  for (const c of searchCompetitors || []) {
    const domain = bareHost(typeof c === "string" ? c : (c?.domain || c?.name || ""));
    if (!domain || seen.has(domain)) continue;
    seen.add(domain);
    const category = classifyCompetitor(c, { sourceBucket: "search" });
    search_landscape.push(toObj(c, category === "platform_interceptor" ? "platform_interceptor" : "search"));
  }
  return { validated_business, search_landscape, validatedDomains: new Set(validated_business.map(c => c.domain)) };
}

/**
 * Derive the competitor brand exclusion list from competitor domains + names.
 * Strips TLDs and common suffixes so "dentsuwebchutney.com" → "dentsu webchutney".
 */
export function deriveCompetitorBrands(competitors = []) {
  const brands = new Set();
  for (const c of competitors) {
    const raw = typeof c === "string" ? c : (c?.name || c?.domain || "");
    if (!raw) continue;
    // From domain
    const host = String(raw).replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
    const namePart = host.split(".")[0]; // strip TLD
    if (namePart && namePart.length >= 3) brands.add(namePart.toLowerCase());
    // From explicit name
    if (c?.name) {
      const cleanName = String(c.name)
        .replace(/\b(pvt|private|limited|ltd|inc|llc|llp|co|company)\b\.?/gi, "")
        .trim();
      if (cleanName.length >= 3) brands.add(cleanName.toLowerCase());
    }
  }
  return [...brands];
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOP-LEVEL ORCHESTRATOR — builds the full Stage-3 payload (Part 2 schema)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Run the complete business logic layer. Produces the canonical structured JSON
 * object that is passed to Claude (Stage 4) and rendered by the template (Stage 5).
 *
 * @param {object} input  all raw collected data
 * @returns {object} the Part-2 structured payload
 */
export function runBusinessLogic(input = {}) {
  const {
    domain, clientName, industry = "", reportType = "website", location = "India",
    baselineRaw = {}, competitors = [], rawKeywords = [],
    businessCompetitors = [], searchCompetitors = [],
    clientGmb = null, competitorGmbs = [],
    directories = [], competitorBacklinks = [],
    clientServiceTerms = [], targetKeywords = [], reportRef = "",
    crawlData = null, verifiedData = null, competitorAudits = [],
    // V3 Part 3 setup-flow inputs (each with a downstream purpose, per rule 2.2)
    reportMode = "", businessScope = "", coreServices = [], negativeExclusions = [],
    // Live GEO/AI-visibility scan output (GEO Vision §14-25): { responses, brandSet,
    // clientDomain, competitorDomains }. When present, Section 10 shows REAL Share-of-
    // Voice + citation intelligence instead of "pending" placeholders.
    aiVisibility = null,
  } = input;

  // ── V3 COMPETITOR SEGMENTATION (Part 4) — only VALIDATED BUSINESS competitors
  //    may enter direct comparison, keyword gap, GBP, and overtake logic. Search
  //    competitors + platform interceptors are confined to a search-context bucket. ──
  const { validated_business, search_landscape, validatedDomains } =
    segmentCompetitors({ businessCompetitors, searchCompetitors, competitors });
  // Everything downstream that drives DIRECT comparison uses the validated set only.
  const comparableCompetitors = validated_business;
  const matchesValidated = (domOrName) => {
    const h = bareHost(domOrName);
    if (!h) return false;
    const stem = h.split(".")[0];
    return [...validatedDomains].some(v => v === h || v.includes(stem) || h.includes(v.split(".")[0]));
  };
  // Filter the GMB + audit datasets so directories/search rivals never reach the
  // head-to-head comparison surfaces.
  const comparableGmbs   = (competitorGmbs || []).filter(g => matchesValidated(g?.domain || g?.name));
  const comparableAudits = (competitorAudits || []).filter(a => matchesValidated(a?.domain || a?.name));

  // ── Ground-truth override: when the client has connected Google Search Console
  //    / Analytics, their OWN site numbers are FACT, not estimates. Prefer them. ──
  const verifiedSources = {};
  let baselineRawResolved = baselineRaw;
  if (verifiedData) {
    if (verifiedData.ga4?.organicTraffic != null) { baselineRawResolved = { ...baselineRawResolved, organicTraffic: verifiedData.ga4.organicTraffic }; verifiedSources.organic_traffic = "verified"; }
    const gscRanked = verifiedData.gsc?.summary?.top100 ?? verifiedData.gsc?.top100;
    if (gscRanked != null) { baselineRawResolved = { ...baselineRawResolved, organicKeywords: gscRanked }; verifiedSources.organic_keywords = "verified"; }
  }

  // ── Competitor brands for exclusion (Problem 2) ── derive from EVERY known
  //    competitor entity (business + search) so no rival brand leaks into content.
  const competitorBrands = deriveCompetitorBrands(
    [...validated_business, ...search_landscape, ...competitors]
  );

  // ── Relevance anchor (Problem 1, Step 2): the client's OWN service vocabulary,
  //    industry, and user-selected target keywords. NEVER the gap keywords being
  //    classified — otherwise every keyword would self-match and nothing excludes. ──
  const relevanceTerms = [
    ...clientServiceTerms,
    ...(Array.isArray(coreServices) ? coreServices : String(coreServices || "").split(/[,;|]/)).filter(Boolean), // V3 3.2 — Step-2 core services strengthen relevance
    ...(targetKeywords || []).filter(Boolean),
    ...tokenizeIndustry(industry),
    industry,
  ].filter(Boolean);

  // Normalise user negative/exclude terms (V3 3.4).
  const negativeExclusionList = (Array.isArray(negativeExclusions) ? negativeExclusions : String(negativeExclusions || "").split(/[,;|]/))
    .map(s => String(s).trim()).filter(Boolean);

  // ── Keyword classification (Problems 1, 2) ──
  const keywords = classifyKeywords(rawKeywords, {
    competitorBrands,
    relevanceTerms,
    clientBrand: clientName || domain?.split(".")[0],
    negativeExclusions: negativeExclusionList,
  });

  // ── Content architecture (Problem 3) ──
  const content_architecture = buildContentArchitecture(keywords.accepted);

  // ── Backlinks (Problem 4) ──
  // Pull competitor directory listings (from their GMB audits) so citation
  // entries can show how many competitors are already listed on each platform.
  const competitorDirectories = (comparableAudits || [])
    .filter(c => c?.gmb && !c.gmb.error && Array.isArray(c.gmb.directories))
    .map(c => ({ name: c.name || c.domain, directories: c.gmb.directories }));
  const backlinks = categorizeBacklinks({ directories, competitorBacklinks, industry, location, competitorDirectories });

  // ── GBP comparison (Problem 5) — validated business competitors only (V3 Part 4.3) ──
  const gbp_comparison = buildGbpComparison(clientGmb, comparableGmbs);

  // ── Comprehensive competitive analysis (us vs them) — validated business only ──
  const competitive_analysis = buildCompetitiveAnalysis({
    client: { crawl: crawlData, gmb: clientGmb, baseline: buildBaseline(baselineRawResolved).baseline },
    competitorAudits: comparableAudits,
  });

  // ── SEO scores (Phase 3) — computed after baseline so they reflect real data ──
  // (baseline is built below; scores assembled at the end before return)

  // ── Baseline with missing-data labels (Problem 7) ──
  const { baseline, missing_fields } = buildBaseline(baselineRawResolved);

  // ── Technical issues (Section 07) ──
  const technical_issues = buildTechnicalIssues(crawlData);

  // ── GEO & AI visibility + schema additions (Section 10) ──
  const hasSchema = !!(crawlData?.summary?.pagesWithSchemaTypes || []).length;
  const geo_and_ai_visibility = buildGeoVisibility({
    domain, clientName, industry, baseline, hasSchema,
    competitors: normalizeCompetitorObjects(comparableCompetitors, comparableGmbs),
    aiResponses: aiVisibility, // live multi-engine scan → real SoV + citations (else null = placeholders)
  });
  // Schema additions belong to the GEO layer (kept out of content_architecture per spec)
  content_architecture.schema_additions = geo_and_ai_visibility.schema_additions.map(s => ({
    type: s.type, note: "Implement the JSON-LD from the GEO layer (Section 10).",
  }));

  // ── KPI validation (Problem 6) ──
  const kpiCtx = {
    acceptedKeywordCount: keywords.accepted.length,
    avgKeywordVolume: avg(keywords.accepted.map(k => k.global_volume).filter(Boolean)) || 400,
    avgDifficulty: avg(keywords.accepted.map(k => k.keyword_difficulty).filter(v => v != null)) || 40,
  };
  const kpis = { metrics: validateKpis(buildKpiSeeds(baseline, missing_fields), kpiCtx) };

  // ── SEO scores (Phase 3) ──
  const scores = computeScores({ baseline, crawlData, gmbData: clientGmb, gbpComparison: gbp_comparison });

  // ── Priority action plan (Section 02) — impact-to-effort ranked, 3 tiers ──
  const priority_action_plan = buildPriorityActionPlan({
    technical_issues, content_architecture, backlinks,
    geo_and_ai_visibility, gbp_comparison,
  });

  // ── V2 STORYTELLING LAYER — formatting, interpretation, opportunity, frames ──
  const v2_additions = buildV2Additions({
    clientName: clientName || domain, baseline, baselineRaw: baselineRawResolved, keywords,
    content_architecture, technical_issues, kpis, scores, gbp_comparison,
    competitors: normalizeCompetitorObjects(comparableCompetitors, comparableGmbs),
    verifiedSources,
  });

  // ── Deterministic CONNECTED STORY (always present, never depends on the live
  //    Claude call) — beginner-friendly, links metrics cause→effect across sections. ──
  const story = buildStoryNarrative({
    clientName: clientName || domain, baseline, scores, gbp_comparison,
    opportunity_summary: v2_additions.opportunity_summary, technical_issues,
    keywords, content_architecture, competitive_analysis,
    competitors: normalizeCompetitorObjects(comparableCompetitors, comparableGmbs),
    geo_and_ai_visibility, kpis,
  });

  return {
    report_meta: {
      client_name: clientName || domain,
      domain,
      industry,
      report_type: reportType,
      report_mode:   reportMode || null,      // V3 3.1 — full website / local SEO / service-page / GEO / hybrid
      business_scope: businessScope || null,  // V3 3.2 — local / regional / national / international
      report_date: new Date().toISOString().slice(0, 10),
      report_ref:  reportRef || generateReportRef(domain),
    },
    baseline,
    competitors: normalizeCompetitorObjects(comparableCompetitors, comparableGmbs),
    // V3 Part 4.3 — search competitors + platform interceptors: SERP/search-market
    // CONTEXT ONLY. Never enter head-to-head comparison, keyword gap, or GBP.
    search_landscape: search_landscape.map(c => ({
      name: c.name,
      domain: c.domain,
      competitor_type: c.competitor_type,
      note: c.competitor_type === "platform_interceptor"
        ? "Directory / marketplace / review platform intercepting search demand — a placement target, not a business rival to overtake."
        : "Ranks in the same search space but is not a validated business competitor — treat as SERP context, not a head-to-head benchmark.",
    })),
    keywords,
    content_architecture,
    technical_issues,
    backlinks,
    gbp_comparison,
    competitive_analysis,
    geo_and_ai_visibility,
    kpis,
    scores,
    priority_action_plan,
    v2_additions,
    story,
    _meta: { competitorBrands, kpiCtx },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONNECTED STORY LAYER (V3 §9 storytelling) — deterministic, always present.
// Beginner-friendly, point-by-point narration that links metrics cause→effect so a
// non-expert understands WHY each number matters, HOW the problems connect, and
// exactly WHAT to do. Renders even when the live Claude narrative is unavailable.
// Returns { [sectionKey]: string[] } — each string is one plain-language point.
// ═══════════════════════════════════════════════════════════════════════════════
export function buildStoryNarrative(input = {}) {
  const {
    clientName = "the business", baseline = {}, scores = {}, gbp_comparison = {},
    opportunity_summary = {}, technical_issues = [], keywords = {},
    content_architecture = {}, competitive_analysis = {}, competitors = [], geo_and_ai_visibility = {},
  } = input;

  const val = (k) => (baseline?.[k]?.value ?? null);
  // Robust formatter: accepts raw numbers OR formatted strings ("1,289"), never emits
  // "NaN"/"null". Returns null when the value can't be parsed → callers fall back.
  const n = (x) => {
    if (x == null) return null;
    if (typeof x === "number") return Number.isFinite(x) ? x.toLocaleString("en-US") : null;
    const s = String(x).replace(/[^0-9.\-]/g, "");
    if (!s || s === "-" || s === ".") return null;
    const num = Number(s);
    return Number.isFinite(num) ? num.toLocaleString("en-US") : null;
  };
  const has = (x) => x != null;

  const name = clientName;
  const mobile = val("mobile_performance_score");
  const lcpMs = val("lcp");
  const lcpSec = has(lcpMs) ? (Number(lcpMs) / 1000).toFixed(1) : null;
  const traffic = val("organic_traffic");
  const orgKw = val("organic_keywords");
  const dr = val("domain_rating");
  const refDomains = val("referring_domains");
  const reviews = val("gbp_review_count");
  const rating = val("gbp_rating");
  const gbpComplete = val("gbp_completeness");
  const siteHealth = val("site_health_score");

  const compReviews = Math.max(
    0,
    Number(gbp_comparison?.review_intel?.competitor_best_reviews || 0),
    ...((gbp_comparison?.competitors || []).map(c => Number(c.review_count ?? c.reviewCount ?? c.reviews ?? 0)))
  );
  const reviewLeader = (gbp_comparison?.competitors || []).find(c => Number(c.review_count ?? c.reviewCount ?? 0) === compReviews);
  const clientReviews = reviews != null ? reviews : (gbp_comparison?.review_intel?.total_reviews ?? null);
  const totalDemand = opportunity_summary?.total_monthly_search_volume;
  const commercialPages = (content_architecture?.commercial_pages || []).length;
  const geoPages = (content_architecture?.geography_pages || content_architecture?.city_pages || []).length;
  const blogPages = (content_architecture?.blog_and_guides || []).length;
  const uplift6 = opportunity_summary?.estimated_traffic_uplift_6m;
  const uplift12 = opportunity_summary?.estimated_traffic_uplift_12m;
  const enquiries12 = has(uplift12) ? Math.round(uplift12 * 0.02) : null;
  const acceptedKw = (keywords?.accepted || []).length;
  const aiCites = geo_and_ai_visibility?.current_ai_citation_count;
  const techCount = technical_issues.length;
  const topTech = technical_issues[0];

  // ── Story narration is written the way the OnIt SEO/GEO report narrates:
  //    flowing, connected sentences that tell a story and teach the reader, in
  //    OnIt's exact vocabulary, fundamentals, logic and strategy. Each section
  //    is 2–3 short paragraphs (not choppy one-liners); sentences connect with
  //    "so / but / which is / that is where / because", and every live metric
  //    is woven in and linked to the others. ───────────────────────────────────
  const speedBad = has(mobile) && mobile < 50;
  const reviewGap = has(clientReviews) && compReviews > clientReviews;
  const lowTrust = (has(dr) && dr < 25) || (has(refDomains) && refDomains < 30);
  const aiZero = aiCites != null && /zero|^not|^0|\bno\b/i.test(String(aiCites));
  const yourEdges = (competitive_analysis?.your_edges || []).length;
  const theirEdges = (competitive_analysis?.their_edges || []).length;
  const invisible = (traffic === 0 || traffic == null) && (orgKw === 0 || orgKw == null);
  const t = traffic === 0 ? "zero" : (n(traffic) || "limited");
  const k = orgKw === 0 ? "zero" : (n(orgKw) || "limited");

  // Leader DR (for "even the DR-X leader hasn't cracked commercial rankings").
  const compTopDr = Math.max(
    0,
    ...((competitors || []).map(c => Number(c?.domain_rating ?? c?.dr ?? c?.domainRating ?? 0))),
    ...((gbp_comparison?.competitors || []).map(c => Number(c?.domain_rating ?? c?.dr ?? 0)))
  );
  const leaderRef = compTopDr > 0 ? `the DR-${compTopDr} market leader` : `the market leader`;
  // Technical-issue fingerprints (OnIt's "Fix Before You Build" priorities).
  const techText = (technical_issues || []).map(t => String(t?.issue ?? t?.title ?? "").toLowerCase()).join(" | ");
  const hasBroken = /404|broken|redirect/.test(techText);
  const hasBlocked = /robots|blocked|noindex/.test(techText);
  const drTargetLow = !has(dr) || dr < 25; // OnIt sets a 25–35 12-month target from a low base.

  const story = {};

  // 01 — THE SITUATION  ·  OnIt "The Baseline" + "The Honest Assessment".
  story.the_situation = [
    `${name} draws ${t} organic traffic from ${k} ranking keywords today${invisible ? " — effectively invisible in Google" : ""}${has(dr) ? `, on a Domain Rating of ${dr}` : ""}.`,
    `Near-zero is an advantage: no penalty history, the commercial space wide open — the plan reverse-engineers the competitors already ranking.`,
  ];

  // 02 — THE OPPORTUNITY
  story.the_opportunity = [
    `${has(totalDemand) ? `About ${n(totalDemand)} searches a month are up for grabs and barely reach you` : `Real commercial demand sits uncaptured today`} — even ${leaderRef} hasn't cracked the commercial rankings.`,
    (commercialPages || geoPages)
      ? `To own it: build ${commercialPages ? `${commercialPages} commercial service pages` : `commercial service pages`}${geoPages ? ` and ${geoPages} location pages` : ""}.`
      : null,
  ].filter(Boolean);

  // 03 — WHAT IS BLOCKING GROWTH
  story.whats_blocking_growth = [
    `${hasBroken ? "Broken pages and redirect chains" : "Technical errors"} make the site hard to crawl, so it ${invisible ? "stays invisible" : "barely ranks"} — ${k} keywords, ${t} visitors a month.${hasBlocked ? " Robots.txt hides key content too." : ""}`,
    (lowTrust || speedBad || reviewGap)
      ? `Weak signals stack up${lowTrust ? `${has(dr) ? ` — DR ${dr}` : " — low authority"}${has(refDomains) ? `, ${n(refDomains)} referring domains` : ""}` : ""}${speedBad ? `${lowTrust ? "," : " —"} a ${lcpSec}s load (vs <2.5s)` : ""}${reviewGap ? `${(lowTrust || speedBad) ? "," : " —"} ${clientReviews} vs ${n(compReviews)} reviews` : ""} — keeping you off tougher terms.`
      : `Each weak signal compounds the next.`,
    `Fix the foundation first; everything else compounds on it.`,
  ].filter(p => p && p.trim());

  // 04 — WHO COMPETES
  story.who_competes = [
    `The strategy reverse-engineers the competitors already ranking${theirEdges ? ` — ${theirEdges} strength${theirEdges === 1 ? "" : "s"} to match` : ""}${yourEdges ? ` and ${yourEdges} gap${yourEdges === 1 ? "" : "s"} to exploit` : ""}.`,
    `The big platforms are interceptors, not rivals — unbeatable nationally, but wide open in the local map pack and on hyper-local long-tail terms.`,
  ];

  // 05 — WHERE DEMAND SITS
  story.where_demand_sits = [
    `${acceptedKw ? `Your ${acceptedKw} target keywords split` : `Demand splits`} into three tiers, each needing its own kind of page.`,
    `Tier 1 — commercial buyer-intent (landing pages); Tier 2 — hyper-local terms (match the local leader); Tier 3 — informational blogs that build authority.`,
  ];

  // 06 — WHAT PAGES NEED TO EXIST
  story.what_pages_needed = [
    (commercialPages || geoPages || blogPages)
      ? `Build ${commercialPages} commercial service pages, ${geoPages} location pages, and ${blogPages} blog post${blogPages === 1 ? "" : "s"}.`
      : `Here is the recommended site structure.`,
    `Each location page needs the city in its H1, title and meta with unique local content — never a template. One page, one intent.`,
  ];

  // 07 — WHAT MUST BE FIXED FIRST
  story.what_to_fix_first = [
    `Fix before you build — search engines read technical signals before a single word of content.`,
    `${hasBroken ? "First, clear the broken pages and redirect chains" : (topTech ? `First, fix ${topTech.issue}` : "Start with the most critical issues")}${hasBlocked ? " and anything blocked in robots.txt" : ""}; then tighten titles, H1s and meta.`,
    `Every page: 800–1,500 unique words, JSON-LD + FAQ schema, internal links${speedBad ? `, and a sub-2.5s load (yours is ${lcpSec}s)` : `, and a sub-2.5s load`}.`,
  ];

  // 08 — HOW AUTHORITY WILL BE BUILT
  story.how_authority_built = [
    `Authority means raising Domain Rating${has(dr) ? ` from ${dr}` : ""}${drTargetLow ? ` toward 25–35 within twelve months` : ` with steady link building`}.`,
    `Start with NAP citations (months 1–2), then content-driven links from local press and partners (2–4), then an ongoing link-gap against the leader.`,
  ];

  // 09 — LOCAL VISIBILITY
  story.local_visibility = [
    `The map pack drives most local calls — your Google Business Profile is the single highest-impact win.`,
    `${reviewGap
        ? `Reviews are the top signal — ${clientReviews} vs the leader's ${n(compReviews)}${reviewLeader?.name ? ` (${reviewLeader.name})` : ""}; target 100+ in six months.`
        : `Reviews are the top local signal; target 100+ in six months.`}`,
    `Verify the listing, add every service, 20+ photos, set service areas, post weekly, and request a review after every job.`,
  ];

  // 10 — GEO / AI VISIBILITY
  story.geo_ai_visibility = [
    `The next frontier is GEO — being cited in AI answers like ChatGPT and Google AI Overviews${aiZero ? `, where you have zero citations today` : ""}.`,
    `Earn citations with FAQ schema (5–8 Q&As per service page), authoritative mentions, and real E-E-A-T signals — author bios, a founder story, consistent NAP.`,
  ];

  // 11 — PRIORITY PLAN
  story.priority_plan = [
    `In order: week one — fix the technical issues and optimise the Google Business Profile; months 1–3 — build the commercial and location pages; ongoing — acquire reviews.`,
    `Blog content, links and AI citations compound on that foundation — which is why it comes first.`,
  ];

  // 12 — WHAT GOOD LOOKS LIKE
  story.what_good_looks_like = [
    `Tracked monthly: ${has(uplift6) ? `~${n(uplift6)} organic visits by month six` : `organic visits climb steadily`}${has(uplift12) ? `, ~${n(uplift12)} by month twelve${enquiries12 ? ` and ~${n(enquiries12)} new enquiries` : ""}` : ""}${has(dr) && drTargetLow ? `, DR rising from ${dr} toward 25–35` : ""}${aiZero ? `, AI citations from zero into double digits` : ""}.`,
    `These are directional targets — outcomes depend on the changes actually being implemented.`,
  ];

  return story;
}

// ═══════════════════════════════════════════════════════════════════════════════
// V2 STORYTELLING LAYER (spec V2 — Parts 1, 3, 5)
// ═══════════════════════════════════════════════════════════════════════════════

// L1 — Human-readable formatting gate.
export function formatMetricValue(key, value) {
  if (value == null) return null;
  const k = String(key).toLowerCase();
  // Timing metrics in ms → seconds when ≥ 1000ms
  if (/lcp|fcp|ttfb|inp|tti|load|timing|_ms/.test(k)) {
    const n = Number(value);
    if (isNaN(n)) return String(value);
    return n >= 1000 ? `${(n / 1000).toFixed(1)} seconds` : `${Math.round(n)} ms`;
  }
  // CLS — small decimal
  if (k === "cls") return Number(value).toFixed(2);
  // Scores out of 100
  if (/score|performance|completeness|health|rating(?!_count)/.test(k) && !/review/.test(k)) {
    if (k.includes("rating") && Number(value) <= 5) return `${Number(value).toFixed(1)}★`;
    return `${Math.round(Number(value))}/100`;
  }
  // Ratings (gbp_rating ≤ 5)
  if (k.includes("rating")) return `${Number(value).toFixed(1)}★`;
  // Volumes & counts → commas (+/mo for volume)
  const n = Number(value);
  if (isNaN(n)) return String(value);
  const withCommas = n.toLocaleString("en-US");
  if (/traffic|volume/.test(k)) return n === 0 ? "0/mo" : `${withCommas}/mo`;
  return withCommas;
}

// Benchmark + commercial interpretation per metric (L1 + L2).
function benchmarkAndInterpretation(key, value, clientName, gbp) {
  const k = String(key).toLowerCase();
  const name = clientName || "the site";
  if (value == null) return { benchmark_label: "", commercial_interpretation: "", what_this_unlocks: "" };

  if (k === "mobile_performance_score" || k === "desktop_performance_score") {
    const dev = k.startsWith("mobile") ? "mobile" : "desktop";
    const v = Number(value);
    if (v < 50) return {
      benchmark_label: "below the 50-point ranking-eligibility threshold — suppressing all pages",
      commercial_interpretation: `Every page on ${name} is loading slowly enough on ${dev} to trigger Google's ranking suppression, so the majority of potential clients searching from their ${dev === "mobile" ? "phones" : "desktops"} hit a degraded experience before they ever see the content.`,
      what_this_unlocks: "Lifting this above 50 moves the whole site out of the penalty zone into the eligible ranking tier.",
    };
    if (v < 90) return {
      benchmark_label: "needs improvement — below the 90-point 'good' band",
      commercial_interpretation: `${name}'s ${dev} experience is functional but not competitive; faster rivals are rewarded with higher placement for the same queries.`,
      what_this_unlocks: "Reaching 90+ removes a ranking handicap applied to every page.",
    };
    return { benchmark_label: "good — in the top performance band", commercial_interpretation: `${name}'s ${dev} performance is a competitive asset, not a liability.`, what_this_unlocks: "" };
  }
  if (k === "lcp") {
    const sec = Number(value) / 1000;
    return {
      benchmark_label: sec > 4 ? "in the penalty zone (target: under 2.5 seconds)" : sec > 2.5 ? "above the 2.5-second 'good' threshold" : "good",
      commercial_interpretation: sec > 2.5 ? `The main content takes ${sec.toFixed(1)} seconds to appear; most visitors abandon a page that makes them wait this long, so paid and organic traffic alike is leaking before it converts.` : "Main content loads fast enough to keep visitors engaged.",
      what_this_unlocks: sec > 2.5 ? "Cutting load time directly reduces bounce and recovers conversions already being paid for." : "",
    };
  }
  if (k === "domain_rating") {
    const v = Number(value);
    return {
      benchmark_label: v < 20 ? "low authority — few sites vouch for this domain" : v < 40 ? "developing authority" : "established authority",
      commercial_interpretation: v < 20 ? `${name} has almost no referrals on record from other websites, which caps how high it can rank for competitive commercial terms regardless of content quality.` : `${name} carries enough trust to compete, but higher-authority rivals still outrank it on the most valuable terms.`,
      what_this_unlocks: v < 40 ? "Building authority raises the ceiling on every keyword the site can realistically win." : "",
    };
  }
  if (k === "organic_traffic") {
    const v = Number(value);
    return {
      benchmark_label: v === 0 ? "no organic visitors yet" : "current organic baseline",
      commercial_interpretation: v === 0 ? `${name} is effectively invisible in organic search today — every customer currently comes from paid or referral channels, leaving the entire search market uncontested.` : `${name} captures ${v.toLocaleString()} organic visits a month, a base that the prescribed work is designed to multiply.`,
      what_this_unlocks: v === 0 ? "Establishing organic traffic creates a compounding, no-cost-per-click acquisition channel." : "",
    };
  }
  if (k === "organic_keywords") {
    const v = Number(value);
    return { benchmark_label: v < 50 ? "thin keyword footprint" : "established footprint", commercial_interpretation: `${name} currently surfaces for ${v.toLocaleString()} search terms; expanding this set is how new customers discover the business without paying per click.`, what_this_unlocks: "" };
  }
  if (k === "referring_domains") {
    const v = Number(value);
    return { benchmark_label: v < 25 ? "few external endorsements" : "growing link profile", commercial_interpretation: `${v.toLocaleString()} other websites link to ${name}; search engines read these as votes of confidence, and more of them lifts ranking power across the whole site.`, what_this_unlocks: "" };
  }
  if (k === "gbp_completeness") {
    const v = Number(value);
    return {
      benchmark_label: `${100 - v} points below the completeness top-ranking local businesses maintain`,
      commercial_interpretation: `${name}'s Google Business Profile is ${v}% complete; every unfilled field is a trust and relevance signal left dark while competitors with fuller profiles win the local pack.`,
      what_this_unlocks: "Completing the profile is the fastest, cheapest lever for local visibility.",
    };
  }
  if (k === "gbp_review_count") {
    const v = Number(value);
    const compMax = Math.max(0, ...((gbp?.competitors || []).map(c => c.review_count || 0)));
    return {
      benchmark_label: compMax > v ? `the leading competitor holds ${compMax}` : "current review base",
      commercial_interpretation: compMax > v ? `${name} has ${v} reviews while the category leader has ${compMax}; when a customer sees both profiles side by side, review volume is the single biggest factor in who they trust and click.` : `${name} has ${v} reviews — a credible base of social proof.`,
      what_this_unlocks: compMax > v ? "Closing the review gap directly shifts the click decision in the client's favour." : "",
    };
  }
  if (k === "gbp_rating") {
    return { benchmark_label: Number(value) >= 4.5 ? "strong" : "below the 4.5★ local-trust threshold", commercial_interpretation: `A ${Number(value).toFixed(1)}★ rating is the first number a searcher judges; it sets expectations before they read a single review.`, what_this_unlocks: "" };
  }
  if (k === "site_health_score") {
    return { benchmark_label: Number(value) < 80 ? "below the 80-point healthy-site band" : "healthy", commercial_interpretation: `The crawl found enough technical friction to hold the site below a clean bill of health; these issues quietly cap the return on every other improvement.`, what_this_unlocks: "" };
  }
  if (k === "cls") {
    const v = Number(value);
    return { benchmark_label: v > 0.1 ? "above the 0.1 'good' threshold — layout shifts on load" : "stable layout", commercial_interpretation: v > 0.1 ? `The page visibly jumps as it loads, which makes visitors mis-tap and erodes trust before they read anything.` : `The layout holds steady as it loads, which keeps visitors oriented.`, what_this_unlocks: v > 0.1 ? "Stabilising the layout reduces accidental bounces and improves the Core Web Vitals score Google rewards." : "" };
  }
  return { benchmark_label: "current reading", commercial_interpretation: "", what_this_unlocks: "" };
}

// Each metric's default data source + confidence (honesty = trust).
//   measured  = we observed it directly (PSI, our crawl, Google's public GMB) — high confidence
//   estimate  = third-party model (DataForSEO keyword/traffic/authority) — modeled, ±range
//   verified  = the client's own Google data (GSC/GA4) — ground truth
const METRIC_SOURCE = {
  domain_rating: "estimate", organic_traffic: "estimate", organic_keywords: "estimate", referring_domains: "estimate",
  mobile_performance_score: "measured", desktop_performance_score: "measured", lcp: "measured", cls: "measured",
  site_health_score: "measured", gbp_completeness: "measured", gbp_review_count: "measured", gbp_rating: "measured",
};

// Rule T1 (V2): every technical metric carries a plain-language definition on
// first appearance, written for a reader who is not an SEO specialist. These are
// the parenthetical glosses the spec mandates (e.g. "Domain Rating (a 0–100
// measure of how trusted the site is by other websites)").
export const PLAIN_LANGUAGE = {
  domain_rating:            "a 0–100 measure of how trusted the site is by other websites",
  organic_traffic:          "visitors who arrive from unpaid Google search results",
  organic_keywords:         "the number of search terms the site already shows up for",
  referring_domains:        "the number of separate websites that link to this one",
  mobile_performance_score: "Google's 0–100 speed grade for the site on phones",
  desktop_performance_score:"Google's 0–100 speed grade for the site on computers",
  lcp:                      "Largest Contentful Paint — how long the main content takes to load",
  cls:                      "Cumulative Layout Shift — how much the page jumps around while loading",
  site_health_score:        "the share of pages free of technical errors",
  gbp_completeness:         "how fully the Google Business Profile is filled out",
  gbp_review_count:         "the number of customer reviews on the Google profile",
  gbp_rating:               "the average star rating on the Google profile",
  errors_404:               "pages returning a not-found error to visitors and crawlers",
  redirect_chains:          "URLs that bounce through multiple redirects before landing",
};
// One-time gloss for the keyword tables (KD column).
export const KD_PLAIN_LANGUAGE = "Keyword Difficulty — how hard it is to rank for a term, where 0 is easy and 100 is near-impossible";
const SOURCE_META = {
  measured: { label: "Measured", confidence: "high",   note: "Observed directly from the live site / Google Business Profile." },
  estimate: { label: "Estimate", confidence: "modeled", note: "Third-party model (DataForSEO). Treat as a ±15% range, not an exact figure." },
  verified: { label: "Verified", confidence: "high",   note: "From the client's connected Google Search Console / Analytics — ground truth." },
};

function buildV2Additions(input) {
  const { clientName, baseline = {}, baselineRaw = {}, keywords = {}, content_architecture = {}, technical_issues = [], kpis = {}, gbp_comparison = {}, verifiedSources = {} } = input;

  // formatted_baseline (L1 + L2)
  const rawMap = {
    domain_rating: baselineRaw.domainRating, organic_traffic: baselineRaw.organicTraffic,
    organic_keywords: baselineRaw.organicKeywords, referring_domains: baselineRaw.referringDomains,
    mobile_performance_score: baselineRaw.performanceMobile, desktop_performance_score: baselineRaw.performanceDesktop,
    lcp: baselineRaw.lcp, cls: baselineRaw.cls, site_health_score: baselineRaw.crawlHealthScore,
    gbp_completeness: baselineRaw.gbpCompletenessScore, gbp_review_count: baselineRaw.gbpReviewCount, gbp_rating: baselineRaw.gbpRating,
    // Site-audit counts — included only when actually collected (no empty rows otherwise).
    ...(baselineRaw.errors404 != null ? { errors_404: baselineRaw.errors404 } : {}),
    ...(baselineRaw.redirectChains != null ? { redirect_chains: baselineRaw.redirectChains } : {}),
  };
  const labelFor = { domain_rating: "Domain Rating", organic_traffic: "Organic Traffic", organic_keywords: "Organic Keywords", referring_domains: "Referring Domains", mobile_performance_score: "Mobile Performance", desktop_performance_score: "Desktop Performance", lcp: "LCP", cls: "Layout Shift (CLS)", site_health_score: "Site Health", gbp_completeness: "GBP Completeness", gbp_review_count: "GBP Reviews", gbp_rating: "GBP Rating", errors_404: "404 Errors", redirect_chains: "Redirect Chains" };
  const formatted_baseline = Object.entries(rawMap).map(([metric, raw]) => {
    const sourceKey = verifiedSources[metric] || METRIC_SOURCE[metric] || "estimate";
    const sm = SOURCE_META[sourceKey] || SOURCE_META.estimate;
    const field = baseline[metric] || {};
    if (field.value == null) {
      return { metric, label: labelFor[metric] || metric, plain_language: PLAIN_LANGUAGE[metric] || "", raw_value: null, formatted_value: null, unavailable_label: field.label || MISSING_LABELS.EMPTY, benchmark_label: "", commercial_interpretation: "", what_this_unlocks: "", source: sourceKey, source_label: sm.label, confidence: sm.confidence, source_note: sm.note };
    }
    const bi = benchmarkAndInterpretation(metric, raw, clientName, gbp_comparison);
    return { metric, label: labelFor[metric] || metric, plain_language: PLAIN_LANGUAGE[metric] || "", raw_value: raw, formatted_value: formatMetricValue(metric, raw), ...bi, source: sourceKey, source_label: sm.label, confidence: sm.confidence, source_note: sm.note };
  });

  // opportunity_summary (L4) — realistic CTR-based traffic projection.
  // Models capturable demand per keyword: volume × achievable-position CTR,
  // ramped over time (6m = early ranking footprint, 12m = matured). This is the
  // industry-standard "addressable traffic" model rather than a flat multiplier.
  const accepted = keywords.accepted || [];
  const commercial = accepted.filter(k => k.intent_class === "transactional" || k.intent_class === "local-commercial");
  const sumVol = (arr) => arr.reduce((s, k) => s + (Number(k.global_volume) || 0), 0);
  const cityPages = content_architecture.city_pages || [];

  // Per-keyword achievable CTR by difficulty (where on page 1 it can realistically land):
  //   easy (KD<30) → ~pos 3-5 ≈ 9% CTR; medium (KD<55) → ~pos 6-8 ≈ 3%; hard → ~pos 9-12 ≈ 1.2%.
  const ctrFor = (kd) => (kd == null ? 0.03 : kd < 30 ? 0.09 : kd < 55 ? 0.03 : 0.012);
  const capturable = accepted.reduce((s, k) => s + (Number(k.global_volume) || 0) * ctrFor(k.keyword_difficulty), 0);
  // 6-month: ~40% of mature footprint live; 12-month: ~95%. Floor to the KPI projection.
  const trafficKpi = (kpis.metrics || []).find(m => (m.key || "").includes("organic_traffic"));
  const kpi6 = toNumOrNull(trafficKpi?.target_6_months) || 0;
  const kpi12 = toNumOrNull(trafficKpi?.target_12_months) || 0;
  const uplift6  = Math.max(Math.round(capturable * 0.4), kpi6);
  const uplift12 = Math.max(Math.round(capturable * 0.95), kpi12, uplift6 * 2);

  const opportunity_summary = {
    total_monthly_search_volume:        sumVol(accepted),
    commercial_keyword_count:           commercial.length,
    commercial_keyword_monthly_volume:  sumVol(commercial),
    city_pages_needed:                  cityPages.length,
    city_pages_monthly_volume:          sumVol(cityPages.map(p => ({ global_volume: p.primary_volume }))),
    quick_wins_available:               accepted.filter(k => k.priority === "HIGH").length,
    estimated_traffic_uplift_6m:        uplift6,
    estimated_traffic_uplift_12m:       uplift12,
    // SaaS extras — richer opportunity framing
    addressable_capturable_monthly:     Math.round(capturable),
    informational_keyword_count:        accepted.filter(k => k.intent_class === "informational").length,
    pages_to_build:                     (content_architecture.commercial_pages || []).length + cityPages.length,
    blog_posts_to_write:                (content_architecture.blog_and_guides || []).length,
  };

  // narrative_connections (L3)
  // V3 storytelling flow — one guided business story, section to section.
  const narrative_connections = [
    { section: "the_situation",        narrative_connection: "That is where the business stands today; the next section sizes exactly what is being left on the table." },
    { section: "the_opportunity",      narrative_connection: "An opportunity this size is only reachable once the ceilings holding the site down are understood — those come next." },
    { section: "whats_blocking_growth",narrative_connection: "With the blockers named, the next question is who is actually winning the demand these ceilings are costing." },
    { section: "who_competes",         narrative_connection: "Knowing where rivals are strong sets up the search territory the next section claims." },
    { section: "where_demand_sits",    narrative_connection: "Each pocket of demand needs a home; the next section maps every cluster to a specific page at the right scope." },
    { section: "what_pages_needed",    narrative_connection: "None of these pages reach their potential until the technical ceiling in the next section is lifted." },
    { section: "what_to_fix_first",    narrative_connection: "With the technical ceiling addressed, off-site authority becomes the next growth lever." },
    { section: "how_authority_built",  narrative_connection: "Authority and reviews feed directly into the local visibility picture examined next." },
    { section: "local_visibility",     narrative_connection: "Winning locally and organically also positions the site to be cited by AI answer engines — the focus of the next section." },
    { section: "geo_ai_visibility",    narrative_connection: "All of this work now sequences into one execution order — the priority plan that follows." },
    { section: "priority_plan",        narrative_connection: "Executed in this order, here is what good looks like at six and twelve months." },
  ];

  // non_expert_section_frames (Part 1 story frames)
  const totalVolFmt = opportunity_summary.total_monthly_search_volume.toLocaleString();
  const bestKw = accepted[0];
  const non_expert_section_frames = {
    keyword_strategy_intro: `These ${accepted.length} keyword clusters represent the searches your potential customers make when looking for what you offer — together about ${totalVolFmt} searches a month. They split into three groups: searches ready to buy (commercial), searches researching before buying (informational), and searches tied to a specific city (local). Each group needs a different type of content to turn the searcher into a customer.${bestKw ? ` The single best opportunity is "${bestKw.keyword}" — it pairs strong demand with attainable difficulty.` : ""}`,
    technical_issues_intro: `Search engines read technical signals before they read any content. The ${technical_issues.length} issue${technical_issues.length === 1 ? "" : "s"} below act as a ceiling — no amount of good content reaches its full ranking potential until these are resolved. They are ordered by the size of that ceiling.`,
    gbp_intro: `Google's local results are won by the profile that best signals trust and relevance. This comparison shows exactly where ${clientName} stands against the competitors appearing above them in local search — and where a few hours of work would immediately change the competitive picture.`,
    authority_intro: `Authority is the web's version of word of mouth: the more credible sites that point to ${clientName}, the more search engines trust it. The opportunities below are grouped from fastest-and-easiest to highest-long-term-value.`,
  };

  return { opportunity_summary, formatted_baseline, narrative_connections, non_expert_section_frames };
}

function toNumOrNull(v) {
  if (v == null) return null;
  if (typeof v === "number") return v;
  const n = parseMetricValue(v);
  return n;
}

function buildBaseline(raw) {
  const missing_fields = [];
  const fields = {
    domain_rating:             raw.domainRating,
    organic_traffic:           raw.organicTraffic,
    organic_keywords:          raw.organicKeywords,
    referring_domains:         raw.referringDomains,
    mobile_performance_score:  raw.performanceMobile,
    desktop_performance_score: raw.performanceDesktop,
    lcp:                       raw.lcp,
    cls:                       raw.cls,
    site_health_score:         raw.crawlHealthScore,
    gbp_completeness:          raw.gbpCompletenessScore,
    gbp_review_count:          raw.gbpReviewCount,
    gbp_rating:                raw.gbpRating,
    errors_404:                raw.errors404,
    redirect_chains:           raw.redirectChains,
  };

  const baseline = {};
  for (const [k, v] of Object.entries(fields)) {
    // PSI / health / completeness: 0 is a valid score; traffic/keywords: 0 is valid too
    const isZeroValid = true;
    const resolved = resolveField(v, { isZeroValid });
    if (!resolved.available) {
      missing_fields.push(k);
      baseline[k] = { value: null, label: resolved.label };
    } else {
      baseline[k] = { value: resolved.value, label: null };
    }
  }
  baseline.missing_fields = missing_fields;
  return { baseline, missing_fields };
}

function buildKpiSeeds(baseline, missing_fields) {
  const val = (k) => baseline[k]?.value ?? null;
  return [
    { metric: "Domain Rating",      key: "domain_rating",      baseline: val("domain_rating") },
    { metric: "Organic Traffic",    key: "organic_traffic",    baseline: val("organic_traffic") },
    { metric: "Organic Keywords",   key: "organic_keywords",   baseline: val("organic_keywords") },
    { metric: "Referring Domains",  key: "referring_domains",  baseline: val("referring_domains") },
    { metric: "Site Health Score",  key: "site_health_score",  baseline: val("site_health_score") },
    { metric: "GBP Completeness",   key: "gbp_completeness",   baseline: val("gbp_completeness") },
    { metric: "GBP Review Count",   key: "gbp_review_count",   baseline: val("gbp_review_count") },
    { metric: "Mobile Performance", key: "mobile_performance_score", baseline: val("mobile_performance_score") },
    { metric: "LCP (ms)",           key: "lcp",                baseline: val("lcp") },
  ];
}

function normalizeCompetitorObjects(competitors, competitorGmbs) {
  return (competitors || []).slice(0, 5).map(c => {
    const name = typeof c === "string" ? c : (c?.name || c?.domain || "");
    const dom  = typeof c === "string" ? c : (c?.domain || c?.name || "");
    const gmb  = competitorGmbs.find(g => g.domain && dom && g.domain.includes(String(dom).split(".")[0]));
    return {
      name,
      domain: dom,
      competitor_type: c?.competitor_type || "direct_business",  // V3 Part 4.1
      threat_level: c?.threat_level || "MEDIUM",
      summary: c?.summary || "",
      what_they_do_well: c?.what_they_do_well || [],
      exploitable_gaps:  c?.exploitable_gaps || [],
      gbp_data: gmb?.gmbCheck?.gmb || {},
    };
  });
}

function avg(arr) {
  if (!arr || !arr.length) return null;
  return arr.reduce((a, b) => a + Number(b || 0), 0) / arr.length;
}

// Expand an industry label into useful relevance tokens.
// e.g. "Digital Marketing" → ["digital", "marketing", "seo", "advertising", "social", "content"]
function tokenizeIndustry(industry) {
  const ind = String(industry || "").toLowerCase();
  const tokens = ind.split(/\s+/).filter(t => t.length >= 4);
  const expansions = {
    "digital marketing": ["seo", "advertising", "social", "content", "ppc", "branding", "campaign", "media"],
    "marketing":         ["seo", "advertising", "social", "content", "branding", "campaign"],
    "healthcare":        ["clinic", "doctor", "medical", "treatment", "health", "patient", "hospital"],
    "ecommerce":         ["store", "shop", "product", "online", "retail", "checkout"],
    "retail":            ["store", "shop", "product", "online", "retail"],
    "technology":        ["software", "app", "platform", "saas", "tech", "development", "cloud"],
    "software":          ["software", "app", "platform", "saas", "development", "cloud", "tool"],
    "legal":             ["lawyer", "attorney", "legal", "law", "litigation", "advocate"],
    "finance":           ["financial", "accounting", "tax", "investment", "loan", "wealth"],
    "food":              ["restaurant", "food", "catering", "menu", "dining", "delivery"],
    "fashion":           ["clothing", "apparel", "fashion", "wear", "style", "boutique"],
    "real estate":       ["property", "realty", "homes", "apartments", "rent", "buy"],
    "education":         ["course", "training", "learning", "school", "coaching", "tutor"],
  };
  for (const [key, exp] of Object.entries(expansions)) {
    if (ind.includes(key)) tokens.push(...exp);
  }
  return [...new Set(tokens)];
}

function generateReportRef(domain) {
  const d = String(domain || "DF").replace(/[^a-z0-9]/gi, "").slice(0, 4).toUpperCase();
  const stamp = new Date().toISOString().slice(2, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `DF-${d}-${stamp}-${rand}`;
}
