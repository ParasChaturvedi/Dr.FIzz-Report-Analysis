// src/lib/seo/geo/model/types.js
// ─────────────────────────────────────────────────────────────────────────────
// GEO MODULE — type definitions (JSDoc; the project is JavaScript, so these give
// editor-level "clean types" without a TS migration). The NormalizedResult /
// NormalizedCitation / NormalizedMention shapes are the CONTRACT every engine
// parser must return (§ Normalized Result Shape) and what geoStore persists.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {"chatgpt"|"aioverviews"|"gemini"|"claude"|"copilot"|"perplexity"} GeoEngine
 * @typedef {"global"|"international"|"country"|"state"|"city"} LocationMode
 * @typedef {"brand"|"competitor"|"third_party"} EntityType
 * @typedef {"direct"|"indirect"|"weakly_related"} RelationshipStrength
 * @typedef {"list"|"paragraph"|"table"|"comparison"|"recommendation"|"mixed"|"unknown"} AnswerStructure
 * @typedef {"high"|"medium"|"low"|"very_low"} ConfidenceLevel
 */

/**
 * §16 — the immutable location context for a run/prompt.
 * @typedef {Object} LocationContext
 * @property {LocationMode} mode
 * @property {string} [country]   ISO-ish country name or code
 * @property {string} [state]
 * @property {string} [city]
 * @property {string} [label]     human label e.g. "Brighton, UK" ("" for global/international)
 * @property {string} [proxyCountry] 2-letter code for the residential proxy ("" => no proxy)
 */

/**
 * §17 — a generated prompt.
 * @typedef {Object} GeoPrompt
 * @property {string} prompt_id
 * @property {string} geo_project_id
 * @property {string} prompt_text
 * @property {string} cluster
 * @property {string} intent
 * @property {number} priority           1..N (lower = more important)
 * @property {LocationContext|null} location_context
 * @property {string[]} source_keywords
 * @property {string} target_brand
 * @property {string} target_domain
 * @property {Array<{name:string,domain:string}>} competitors
 * @property {AnswerStructure|string} [expected_answer_type]
 * @property {string} run_status
 * @property {string} created_at
 */

/**
 * § Mentions — a brand/competitor/third-party appearing in an answer.
 * @typedef {Object} NormalizedMention
 * @property {string} entity_name
 * @property {EntityType} entity_type
 * @property {string} [domain]
 * @property {number} mention_count
 * @property {number|null} mention_position   1-based order of FIRST appearance in the answer
 * @property {string} [context_snippet]
 * @property {number} confidence              0..1
 */

/**
 * §23 — a single citation found in an answer.
 * @typedef {Object} NormalizedCitation
 * @property {string} cited_brand             "" when third-party
 * @property {string} cited_domain
 * @property {string} cited_url
 * @property {number|null} citation_order     1-based order in the answer
 * @property {string} [citation_type]         e.g. "footnote"|"inline"|"source_card"|"badge"|"anchor"
 * @property {string} [source_type]           plain label e.g. "Review platform"
 * @property {boolean} is_brand_domain
 * @property {boolean} is_competitor_domain
 * @property {RelationshipStrength} [relationship_strength]
 * @property {string} [page_title]
 * @property {string} [snippet]
 * @property {number} confidence              0..1
 */

/**
 * § Normalized Result Shape — what EVERY engine parser returns + geoStore persists
 * as one geo_run_results document (+ child mentions/citations).
 * @typedef {Object} NormalizedResult
 * @property {string} promptId
 * @property {GeoEngine} engine
 * @property {string|null} accountId
 * @property {string} timestamp              ISO
 * @property {LocationContext|null} locationContext
 * @property {string} rawPrompt
 * @property {string} rawHtml                full UI HTML (audit) — never overwritten
 * @property {string} renderedText           primary readable answer
 * @property {string} [visibleAnswerText]
 * @property {AnswerStructure} answerStructure
 * @property {number} answerLength
 * @property {NormalizedMention[]} brandMentions
 * @property {NormalizedMention[]} competitorMentions
 * @property {NormalizedCitation[]} citations
 * @property {number} citationCount
 * @property {string[]} sourceDomains
 * @property {number} parseConfidence        0..1
 * @property {string|null} [screenshotUrl]
 * @property {Object} [parserOutput]         raw parser JSON (traceability)
 * @property {string[]} errors
 * @property {number} retries
 * @property {string} [cluster]
 * @property {string} [intent]
 * @property {string} runStatus
 */

/**
 * § Required Database Models — geo_runs.
 * @typedef {Object} GeoRun
 * @property {string} run_id
 * @property {string} geo_project_id
 * @property {string} run_name
 * @property {string} status
 * @property {GeoEngine[]} engines
 * @property {LocationContext} location_context
 * @property {number} prompt_count
 * @property {number} valid_result_count
 * @property {number} error_count
 * @property {string|null} started_at
 * @property {string|null} completed_at
 * @property {string} created_at
 */

/**
 * §24 — a citation turned into a backlink/content opportunity.
 * @typedef {Object} GeoOpportunity
 * @property {string} geo_citation_id
 * @property {string} geo_project_id
 * @property {string} cited_url
 * @property {string} cited_domain
 * @property {string} citation_class
 * @property {number} link_opportunity_score  0..100
 * @property {"low"|"medium"|"high"|"very_high"} link_acquisition_difficulty
 * @property {"owned"|"claimable"|"outreach_possible"|"third_party_controlled"|"no_control"} editorial_control
 * @property {number} relevance_score         0..100
 * @property {number} authority_score         0..100
 * @property {string} action_type
 * @property {number} classification_confidence 0..1
 * @property {string} reasoning_summary
 * @property {string} recommended_next_step
 * @property {string} [related_prompt]
 * @property {string} [related_engine]
 * @property {string} [related_competitor]
 * @property {string} status
 * @property {string} created_at
 */

export {}; // typedef-only module
