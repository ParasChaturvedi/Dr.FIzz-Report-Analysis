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

/**
 * § Cost control — the resolved config for a run (stored on geo_runs). Vercel builds
 * this (run-mode preset + user overrides), shows the estimate, then creates the job.
 * @typedef {Object} GeoRunConfig
 * @property {"dev_smoke"|"standard"|"full"|"validation"} run_mode
 * @property {GeoEngine[]} selected_engines
 * @property {number} prompt_limit
 * @property {boolean} validation_enabled
 * @property {number} validation_sample_percent    10..25
 * @property {LocationMode} location_mode
 * @property {boolean} proxy_enabled
 * @property {boolean} residential_proxy_enabled    only when country/state/city selected
 * @property {"local-playwright"|"worker-playwright"|"browserless"|"browserless-residential-proxy"} execution_provider
 * @property {number} estimated_engine_runs
 * @property {"low"|"medium"|"high"|"full"} estimated_cost_level
 * @property {number} [estimated_cost_usd]
 * @property {number} max_retries
 * @property {number} concurrency_limit
 * @property {boolean} cache_reuse_enabled
 * @property {boolean} force_refresh
 * @property {"off"|"on_error"|"always"} screenshot_mode
 * @property {number|null} budget_limit             max USD per project (null = no cap)
 * @property {boolean} stopped_by_user
 */

/**
 * § Claude storytelling — one narrative section, stored + fetched in the report.
 * @typedef {Object} GeoStorytellingSection
 * @property {string} geo_project_id
 * @property {string} geo_run_id
 * @property {string} section_key      e.g. "executive_geo_summary", "why_competitors_winning", "30_day_plan"
 * @property {string} title
 * @property {string} body             plain-language narrative
 * @property {string[]} [evidence_refs] prompt/result/citation ids this maps back to (no invention)
 * @property {number} [order]
 * @property {string} created_at
 */

/**
 * § Raw-answer version — immutable capture, never overwritten (No Data Loss Rule).
 * @typedef {Object} GeoRawAnswerVersion
 * @property {string} geo_project_id
 * @property {string} geo_run_id
 * @property {string} geo_run_result_id
 * @property {string} prompt_id
 * @property {GeoEngine} engine
 * @property {number} version
 * @property {string} raw_prompt
 * @property {string} raw_html
 * @property {string} rendered_text
 * @property {Object} [parser_output]
 * @property {string} captured_at
 */

/**
 * § Collection error — every failed run/retry, for the collection-health UI.
 * @typedef {Object} GeoError
 * @property {string} geo_project_id
 * @property {string} geo_run_id
 * @property {string} [prompt_id]
 * @property {string} [engine]
 * @property {string} [account_id]
 * @property {"timeout"|"blocked"|"session_expired"|"blank_answer"|"partial_answer"|"parse_failure"|"other"} error_type
 * @property {string} message
 * @property {number} retry_count
 * @property {string} created_at
 */

/**
 * § Phase 2.5 — data readiness for a GEO plan. Captured on geo_runs + geo_prompts and
 * surfaced in the preview. PLANNING CONTEXT ONLY — never a GEO result/score (Phase 3).
 * @typedef {Object} GeoDataReadiness
 * @property {"website_only"|"audit_partial"|"seo_data_ready"|"step5b_ready"|"full_ready"} data_readiness_status
 * @property {Array<"step1_website"|"step2_business_context"|"step3_keywords"|"step4_competitors"|"step5_audit"|"step5b_dataforseo"|"step5b_moz"|"step5b_serp"|"step5b_backlinks"|"step5b_authority"|"step5b_competitor_data">} data_sources_used
 * @property {"low"|"medium"|"high"} geo_prompt_confidence
 * @property {{keywords_used:number,competitors_used:number,serp_results_used:number}} counts
 * @property {{used_dataforseo:boolean,used_moz:boolean,used_serp:boolean,used_step5b:boolean}} flags
 */

/**
 * § Phase 2.5 — plan DEPTH (how much data backs the plan), distinct from run mode
 * (prompt VOLUME). "quick" = Step-1 website + basic crawl/audit (low confidence,
 * "basic"); "full" = Steps 1-5 + 5B (production default, higher confidence).
 * @typedef {"quick"|"full"} GeoPlanMode
 */

export {}; // typedef-only module
