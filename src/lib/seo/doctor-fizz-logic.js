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
  // Known city/region name present?
  for (const loc of KNOWN_LOCATIONS) {
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
      return "City Page";
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
  const { competitorBrands = [], relevanceTerms = [], clientBrand = "" } = ctx;

  const base = {
    keyword,
    global_volume:      kw.volume ?? null,
    local_volume:       kw.localVolume ?? kw.volume ?? null,
    keyword_difficulty: kw.difficulty != null ? Math.round((kw.difficulty <= 1 ? kw.difficulty * 100 : kw.difficulty)) : null,
    position:           kw.position ?? null,
    url:                kw.url ?? null,
  };

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
    return {
      ...base,
      intent_class:          "local-commercial",
      recommended_asset_type: "City Page",
      funnel_role:           "Conversion",
      reason:                "Geo-modifier combined with a commercial term. Maps to a city/geo landing page, not a generic service page.",
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
  const city_pages       = [];

  const slugify = (s) => String(s).toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 60);

  for (const k of accepted) {
    const fundamentals = {
      keyword_cluster: k.keyword,
      primary_volume:  k.global_volume,
      intent_class:    k.intent_class,
      asset_type:      k.recommended_asset_type,
      funnel_role:     k.funnel_role,
      priority:        k.priority,
    };

    if (k.intent_class === "transactional") {
      commercial_pages.push({
        ...fundamentals,
        page_name:        toTitle(k.keyword),
        url_slug:         "/" + slugify(k.keyword),
        commercial_reason: `Captures "${k.keyword}" buyers with conversion intent — a blog cannot convert this query.`,
      });
    } else if (k.intent_class === "local-commercial") {
      city_pages.push({
        ...fundamentals,
        page_name:        toTitle(k.keyword),
        city_target:      extractCity(k.keyword),
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
    city_pages,
    schema_additions: [], // populated by the GEO layer, kept separate per spec
  };
}

function toTitle(s) {
  return String(s).replace(/\b\w/g, c => c.toUpperCase());
}

function extractCity(keyword) {
  const k = String(keyword).toLowerCase();
  for (const loc of KNOWN_LOCATIONS) {
    if (new RegExp(`\\b${escapeRegex(loc)}\\b`).test(k)) return toTitle(loc);
  }
  return "";
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
  const { directories = [], competitorBacklinks = [], industry = "", location = "India" } = input;

  // ── Category 1: Citation and directory links ──
  const citation_links = CITATION_PLATFORMS.map(p => {
    const match = directories.find(d =>
      String(d.site || "").includes(p.site.split("/")[0]) ||
      String(d.name || "").toLowerCase() === p.name.toLowerCase()
    );
    return {
      platform:          p.name,
      domain_rating:     p.dr,
      client_listed:     match ? match.listed === true : false,
      listing_url:       match?.listingUrl || null,
      effort_hours:      "≈1 hour",
      signal:            p.signal,
      category:          "citation",
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
    .map(c => toRow(c.domain || "Competitor", c.gmbCheck));

  const analysis = computeGbpGaps(client, competitors);

  return {
    client,
    competitors,
    biggest_gap:  analysis.biggestGap,
    fastest_win:  analysis.fastestWin,
    trust_gap:    analysis.trustGap,
    has_competitor_data: competitors.length > 0,
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
// KPI DIRECTIONAL VALIDATION (Problem 6)
// ═══════════════════════════════════════════════════════════════════════════════

// Metrics where a higher value is better.
const HIGHER_IS_BETTER = new Set([
  "organic_traffic", "organic_keywords", "referring_domains", "domain_rating",
  "gbp_completeness", "gbp_review_count", "review_count", "review_rating", "gbp_rating",
  "site_health_score",
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
  if (baseline <= 100) return Math.round(baseline + (months >= 12 ? 30 : 12)); // DR-like
  return Math.round(baseline * factor);
}

function improveDown(baseline, months) {
  const factor = months >= 12 ? 0.5 : 0.75;
  return Math.round(baseline * factor * 100) / 100;
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

  if (crawlData.crawlBlockedByRobots)
    issues.push({ priority: "CRITICAL", issue: "Googlebot blocked by robots.txt", affected_count: siteSize, recommended_action: "Remove 'Disallow: /' from /robots.txt. Google cannot index any page until this is lifted — every other action is dark while this stands.", estimated_effort: "≈15 min" });

  if (!crawlData.hasSitemap)
    issues.push({ priority: "HIGH", issue: "XML sitemap missing", affected_count: siteSize, recommended_action: `Generate /sitemap.xml listing all canonical URLs${siteSize ? ` (≈${siteSize} pages detected)` : ""} and submit in Google Search Console → Sitemaps. Without it, crawl discovery of a large site is throttled.`, estimated_effort: "≈1 hour" });

  if (!(s.pagesWithSchemaTypes || []).length)
    issues.push({ priority: "HIGH", issue: "Zero structured data (schema) sitewide", affected_count: siteSize, recommended_action: "Add LocalBusiness + WebSite JSON-LD to the homepage, Service schema to service pages, FAQPage schema to FAQ blocks. This is the precondition for AI Overview (GEO) inclusion.", estimated_effort: "≈1 day" });

  if ((s.pagesMissingMetaTitle || 0) > 0)
    issues.push({ priority: "HIGH", issue: `${s.pagesMissingMetaTitle} pages missing <title> tags`, affected_count: s.pagesMissingMetaTitle, recommended_action: 'Write unique 50–60 char titles as "Primary Keyword | Brand", starting with highest-traffic pages.', estimated_effort: "≈3 hours" });

  if ((s.pagesMissingH1 || 0) > 0)
    issues.push({ priority: "HIGH", issue: `${s.pagesMissingH1} pages with no H1`, affected_count: s.pagesMissingH1, recommended_action: "Add exactly one keyword-rich H1 per page — the clearest on-page relevance signal exposed to Google.", estimated_effort: "≈2 hours" });

  const lcpVal = crawlData.coreWebVitals?.lcp ?? crawlData.coreWebVitals?.LCP;
  if (lcpVal && Number(lcpVal) > 2500)
    issues.push({ priority: "HIGH", issue: `Mobile LCP at ${lcpVal}ms (target <2500ms)`, affected_count: crawlData.pageCount || null, recommended_action: "Compress hero images to WebP, preload the LCP element, defer non-critical JS. Poor LCP suppresses the majority of mobile searches regardless of content quality.", estimated_effort: "≈1 week" });

  if ((s.pagesMissingMetaDesc || 0) > 0)
    issues.push({ priority: "MEDIUM", issue: `${s.pagesMissingMetaDesc} pages missing meta descriptions`, affected_count: s.pagesMissingMetaDesc, recommended_action: "Write 150–160 char descriptions with a CTA. Lifts click-through 5–10% on existing impressions.", estimated_effort: "≈2 hours" });

  const dupTitles = (crawlData.duplicates || []).filter(d => d.type === "title").length;
  if (dupTitles > 0)
    issues.push({ priority: "MEDIUM", issue: `${dupTitles} sets of duplicate meta titles`, affected_count: dupTitles, recommended_action: "Make every title unique — duplicates force Google to pick a ranking URL arbitrarily, splitting relevance.", estimated_effort: "≈2 hours" });

  if ((crawlData.brokenLinks || []).length > 0)
    issues.push({ priority: "MEDIUM", issue: `${crawlData.brokenLinks.length} broken internal links`, affected_count: crawlData.brokenLinks.length, recommended_action: `Fix or 301-redirect each. First: ${crawlData.brokenLinks.slice(0, 2).map(b => b.url).join(", ")}`, estimated_effort: "≈2 hours" });

  if ((s.thinContentCount || 0) > 0)
    issues.push({ priority: "MEDIUM", issue: `${s.thinContentCount} thin-content pages (<200 words)`, affected_count: s.thinContentCount, recommended_action: "Expand to 600+ words with FAQs and local context. Thin pages drag the sitewide quality signal down.", estimated_effort: "≈1 week" });

  if ((s.totalImgsWithoutAlt || 0) > 5)
    issues.push({ priority: "MEDIUM", issue: `${s.totalImgsWithoutAlt} images without alt text`, affected_count: s.totalImgsWithoutAlt, recommended_action: "Add descriptive, keyword-natural alt text. Affects accessibility score and image-search visibility.", estimated_effort: "≈2 hours" });

  if ((s.pagesMultipleH1 || 0) > 0)
    issues.push({ priority: "LOW", issue: `${s.pagesMultipleH1} pages with multiple H1s`, affected_count: s.pagesMultipleH1, recommended_action: "Demote extra H1s to H2/H3 — one H1 per page.", estimated_effort: "≈1 hour" });

  if (!crawlData.hasRobots)
    issues.push({ priority: "LOW", issue: "robots.txt not found", affected_count: null, recommended_action: "Create /robots.txt with a Sitemap: directive pointing to your sitemap.xml.", estimated_effort: "≈15 min" });

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

  return {
    current_ai_citation_count: currentCitations,
    competitor_citation_benchmarks: competitorBenchmarks,
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
  const add = (tier, description, channel, priority, effort) =>
    actions.push({ tier, description, channel, priority, effort, _impact: PRIORITY_IMPACT[priority] || 2, _hours: effortToHours(effort) });

  // ── Tier 1: Foundation fixes (technical blockers gate everything) ──
  for (const t of technical_issues) {
    if (t.priority === "CRITICAL" || t.priority === "HIGH") {
      add("Foundation Fixes", t.issue + " — " + (t.recommended_action || "").split(".")[0], "SEO", t.priority, t.estimated_effort);
    }
  }

  // ── Tier 2: Content & on-page work ──
  for (const p of (content_architecture.commercial_pages || []).slice(0, 4)) {
    add("Content & On-Page Work", `Build commercial page: ${p.page_name} (${p.url_slug}) targeting "${p.keyword_cluster}"`, "SEO", p.priority === "HIGH" ? "HIGH" : "MEDIUM", "≈1 week");
  }
  for (const p of (content_architecture.city_pages || []).slice(0, 3)) {
    add("Content & On-Page Work", `Create city page for ${p.city_target}: "${p.keyword_cluster}"`, "SEO", "MEDIUM", "≈3 hours");
  }
  for (const p of (content_architecture.blog_and_guides || []).slice(0, 3)) {
    add("Content & On-Page Work", `Publish guide: "${p.proposed_title}"`, "SEO", "MEDIUM", "≈1 week");
  }

  // ── Tier 3: Authority & GEO work ──
  const missingCitations = (backlinks.citation_links || []).filter(l => !l.client_listed).slice(0, 5);
  if (missingCitations.length) {
    add("Authority & GEO Work", `Claim ${missingCitations.length} missing citation listings (${missingCitations.map(l => l.platform).join(", ")})`, "SEO", "QUICK WIN", "≈3 hours");
  }
  for (const l of (backlinks.editorial_links || []).slice(0, 2)) {
    add("Authority & GEO Work", `Editorial link: ${l.content_asset}`, "SEO", "MEDIUM", l.effort || "≈2 weeks");
  }
  for (const g of (backlinks.competitor_gap || []).slice(0, 2)) {
    add("Authority & GEO Work", `Pursue competitor-gap link from ${g.referring_domain}`, "SEO", "MEDIUM", "≈1 week");
  }
  if ((geo_and_ai_visibility.schema_additions || []).length) {
    add("Authority & GEO Work", `Implement ${geo_and_ai_visibility.schema_additions.map(s => s.type).join(" + ")} JSON-LD for AI citation`, "SEO+GEO", "HIGH", "≈3 hours");
  }
  for (const a of (geo_and_ai_visibility.recommended_actions || []).slice(0, 2)) {
    add("Authority & GEO Work", a.split(".")[0], "GEO", "MEDIUM", "≈1 day");
  }
  if (gbp_comparison?.client && gbp_comparison.fastest_win) {
    add("Authority & GEO Work", `GBP fastest win: ${gbp_comparison.fastest_win.split(".")[0]}`, "SEO", "QUICK WIN", "≈30 min");
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
    clientGmb = null, competitorGmbs = [],
    directories = [], competitorBacklinks = [],
    clientServiceTerms = [], targetKeywords = [], reportRef = "",
    crawlData = null,
  } = input;

  // ── Competitor brands for exclusion (Problem 2) ──
  const competitorBrands = deriveCompetitorBrands(competitors);

  // ── Relevance anchor (Problem 1, Step 2): the client's OWN service vocabulary,
  //    industry, and user-selected target keywords. NEVER the gap keywords being
  //    classified — otherwise every keyword would self-match and nothing excludes. ──
  const relevanceTerms = [
    ...clientServiceTerms,
    ...(targetKeywords || []).filter(Boolean),
    ...tokenizeIndustry(industry),
    industry,
  ].filter(Boolean);

  // ── Keyword classification (Problems 1, 2) ──
  const keywords = classifyKeywords(rawKeywords, {
    competitorBrands,
    relevanceTerms,
    clientBrand: clientName || domain?.split(".")[0],
  });

  // ── Content architecture (Problem 3) ──
  const content_architecture = buildContentArchitecture(keywords.accepted);

  // ── Backlinks (Problem 4) ──
  const backlinks = categorizeBacklinks({ directories, competitorBacklinks, industry, location });

  // ── GBP comparison (Problem 5) ──
  const gbp_comparison = buildGbpComparison(clientGmb, competitorGmbs);

  // ── SEO scores (Phase 3) — computed after baseline so they reflect real data ──
  // (baseline is built below; scores assembled at the end before return)

  // ── Baseline with missing-data labels (Problem 7) ──
  const { baseline, missing_fields } = buildBaseline(baselineRaw);

  // ── Technical issues (Section 07) ──
  const technical_issues = buildTechnicalIssues(crawlData);

  // ── GEO & AI visibility + schema additions (Section 10) ──
  const hasSchema = !!(crawlData?.summary?.pagesWithSchemaTypes || []).length;
  const geo_and_ai_visibility = buildGeoVisibility({
    domain, clientName, industry, baseline, hasSchema,
    competitors: normalizeCompetitorObjects(competitors, competitorGmbs),
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
    clientName: clientName || domain, baseline, baselineRaw, keywords,
    content_architecture, technical_issues, kpis, scores, gbp_comparison,
    competitors: normalizeCompetitorObjects(competitors, competitorGmbs),
  });

  return {
    report_meta: {
      client_name: clientName || domain,
      domain,
      industry,
      report_type: reportType,
      report_date: new Date().toISOString().slice(0, 10),
      report_ref:  reportRef || generateReportRef(domain),
    },
    baseline,
    competitors: normalizeCompetitorObjects(competitors, competitorGmbs),
    keywords,
    content_architecture,
    technical_issues,
    backlinks,
    gbp_comparison,
    geo_and_ai_visibility,
    kpis,
    scores,
    priority_action_plan,
    v2_additions,
    _meta: { competitorBrands, kpiCtx },
  };
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

function buildV2Additions(input) {
  const { clientName, baseline = {}, baselineRaw = {}, keywords = {}, content_architecture = {}, technical_issues = [], kpis = {}, gbp_comparison = {} } = input;

  // formatted_baseline (L1 + L2)
  const rawMap = {
    domain_rating: baselineRaw.domainRating, organic_traffic: baselineRaw.organicTraffic,
    organic_keywords: baselineRaw.organicKeywords, referring_domains: baselineRaw.referringDomains,
    mobile_performance_score: baselineRaw.performanceMobile, desktop_performance_score: baselineRaw.performanceDesktop,
    lcp: baselineRaw.lcp, cls: baselineRaw.cls, site_health_score: baselineRaw.crawlHealthScore,
    gbp_completeness: baselineRaw.gbpCompletenessScore, gbp_review_count: baselineRaw.gbpReviewCount, gbp_rating: baselineRaw.gbpRating,
  };
  const labelFor = { domain_rating: "Domain Rating", organic_traffic: "Organic Traffic", organic_keywords: "Organic Keywords", referring_domains: "Referring Domains", mobile_performance_score: "Mobile Performance", desktop_performance_score: "Desktop Performance", lcp: "LCP (page load)", cls: "Layout Shift (CLS)", site_health_score: "Site Health", gbp_completeness: "GBP Completeness", gbp_review_count: "GBP Reviews", gbp_rating: "GBP Rating" };
  const formatted_baseline = Object.entries(rawMap).map(([metric, raw]) => {
    const field = baseline[metric] || {};
    if (field.value == null) {
      return { metric, label: labelFor[metric] || metric, raw_value: null, formatted_value: null, unavailable_label: field.label || MISSING_LABELS.EMPTY, benchmark_label: "", commercial_interpretation: "", what_this_unlocks: "" };
    }
    const bi = benchmarkAndInterpretation(metric, raw, clientName, gbp_comparison);
    return { metric, label: labelFor[metric] || metric, raw_value: raw, formatted_value: formatMetricValue(metric, raw), ...bi };
  });

  // opportunity_summary (L4)
  const accepted = keywords.accepted || [];
  const commercial = accepted.filter(k => k.intent_class === "transactional" || k.intent_class === "local-commercial");
  const sumVol = (arr) => arr.reduce((s, k) => s + (Number(k.global_volume) || 0), 0);
  const cityPages = content_architecture.city_pages || [];
  const trafficKpi = (kpis.metrics || []).find(m => (m.key || "").includes("organic_traffic"));
  const opportunity_summary = {
    total_monthly_search_volume:        sumVol(accepted),
    commercial_keyword_count:           commercial.length,
    commercial_keyword_monthly_volume:  sumVol(commercial),
    city_pages_needed:                  cityPages.length,
    city_pages_monthly_volume:          sumVol(cityPages.map(p => ({ global_volume: p.primary_volume }))),
    quick_wins_available:               accepted.filter(k => k.priority === "HIGH").length,
    estimated_traffic_uplift_6m:        toNumOrNull(trafficKpi?.target_6_months),
    estimated_traffic_uplift_12m:       toNumOrNull(trafficKpi?.target_12_months),
  };

  // narrative_connections (L3)
  const narrative_connections = [
    { section: "executive_summary",  narrative_connection: "The sections that follow break this prescription down: what is broken, why it matters commercially, and the exact order to fix it." },
    { section: "baseline_snapshot",  narrative_connection: "These metrics set the ceiling. Section 07 shows precisely which technical issues to remove first and why the order matters." },
    { section: "competitor_landscape", narrative_connection: "Knowing where rivals are strong sets up the keyword territory the next section claims." },
    { section: "keyword_strategy",   narrative_connection: "Each keyword cluster needs a home; the content architecture section maps every cluster to a specific page." },
    { section: "content_architecture", narrative_connection: "None of these pages will reach their potential until the technical ceiling in the next section is lifted." },
    { section: "technical_foundation", narrative_connection: "With the technical ceiling addressed, off-site authority becomes the next growth lever." },
    { section: "authority_link_building", narrative_connection: "Local authority and reviews feed directly into the Google Business Profile picture examined next." },
    { section: "local_visibility_gbp", narrative_connection: "Winning locally and organically also positions the site to be cited by AI answer engines — the focus of the GEO section." },
    { section: "geo_ai_visibility",  narrative_connection: "All of this work is only worth doing if it moves the numbers; the forecast section sets the targets." },
    { section: "kpi_forecast",       narrative_connection: "The final section sequences every action into a week-by-week plan the team can execute immediately." },
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
