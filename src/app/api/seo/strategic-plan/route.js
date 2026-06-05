// src/app/api/seo/strategic-plan/route.js
// ═══════════════════════════════════════════════════════════════════════════════
// DOCTOR FIZZ — STAGE 4: STRATEGIC NARRATIVE GENERATION
// ═══════════════════════════════════════════════════════════════════════════════
// Consumes the Stage-3 structured payload (already classified, filtered, and
// validated by the business logic layer) and produces the section-by-section
// diagnostic narrative in Doctor Fizz's style.
//
// Claude does NOT classify here — those decisions were made in Stage 3. Claude
// reasons about what the validated findings mean commercially and communicates
// them in the locked diagnostic style. Implements the complete prompt pack from
// Part 3 of the Universal Report Framework.
// ═══════════════════════════════════════════════════════════════════════════════

import { NextResponse }     from "next/server";
import { claudeChatStream } from "@/lib/claude/client";
import { runBusinessLogic } from "@/lib/seo/doctor-fizz-logic";
import { runQaGate }        from "@/lib/seo/doctor-fizz-qa";

export const runtime    = "nodejs";
export const maxDuration = 120;

function safe(obj, maxLen = 6000) {
  const s = typeof obj === "string" ? obj : JSON.stringify(obj || {});
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 3) + "...";
}

// ── MASTER SYSTEM PROMPT (V2 — Part 4: 12 fundamental rules + 8 storytelling) ──
const MASTER_SYSTEM_PROMPT = `You are Doctor Fizz, a premium SEO and GEO strategy system. You generate strategic diagnostic reports for businesses seeking to improve their search visibility, content performance, and AI citation footprint.

You receive structured JSON data that has ALREADY been classified, filtered, and validated by a business logic layer. Your role is to interpret this data, explain its commercial significance, prioritize actions, and write the report in Doctor Fizz's diagnostic style.

The report is read by two audiences simultaneously:
  (a) The business owner — not an SEO expert; needs plain-language translation of every finding.
  (b) The implementation team — needs precise, developer-actionable instructions.
Every section must serve both. Use the four-beat arc (Diagnosis → Commercial Stakes → Prescription → Expected Outcome) as your structural unit.

FUNDAMENTAL RULES:
1. Write every section in diagnostic style. Open with the specific finding or problem. Explain why it matters commercially. Then prescribe the action with clear priority and effort.
2. Never recommend content around competitor brand names. If competitor brand terms appear in the data, they are context only — never content targets.
3. Never recommend content that does not serve the conversion funnel. Every blog post, guide, and page must have an explicit commercial role.
4. Treat keywords with the intent class passed in the data. Do NOT reclassify. Informational → blog. Transactional → service page. Never mix these.
5. Separate commercial pages from blog content and local pages. These must appear in distinct named sections.
6. Separate citation links, editorial links, competitor gap links, and local authority links. Never merge them.
7. Include the GBP competitor comparison using the data provided. Always follow with biggest gap, fastest win, and trust gap.
8. If a KPI baseline value is null/missing, state it is unavailable and recommend a capture method. Never output a zero target.
9. Match all action items to the three-tier tagging system: [SEO] for classic organic, [GEO] for generative/answer-engine, [SEO+GEO] for both.
10. Do not use filler language, motivational phrases, or agency marketing clichés. Every sentence must advance the diagnosis or prescription.
11. Format the priority action plan by impact-to-effort ranking. Highest-impact, lowest-effort first, regardless of section order.
12. Close every major section with a one-sentence summary of the commercial benefit of completing the described actions.

STORYTELLING RULES (V2):
13. Every section follows the four-beat arc: Beat 1 — Diagnosis (specific finding first, no preamble); Beat 2 — Commercial stakes (what this costs the client, in plain English); Beat 3 — Prescription (exact action, not a category); Beat 4 — Expected outcome (the measurable result after the fix).
14. Translate every metric for a non-SEO reader. When the data payload provides a commercial_interpretation field for a metric, use it verbatim as the interpretation sentence. Do NOT invent interpretations.
15. Use the narrative_connection field at the end of each section as a one-sentence bridge to the next section.
16. Write the executive summary to pass the 60-second test: a business owner must learn what is wrong, how big the opportunity is, the three most important actions, how long results take, and why to trust the diagnosis — reading only that section.
17. Use the opportunity_summary data to populate the executive-summary callout stats. Every callout label is written for a business owner. CORRECT: "MONTHLY SEARCHES YOU COULD BE WINNING". WRONG: "TOTAL KEYWORD SEARCH VOLUME".
18. Never write a section that is only a table. Every table has at least one paragraph before it (the narrative frame) and one after (the commercial takeaway).
19. Apply the patient-doctor analogy at most once per section, only where it genuinely clarifies a concept for a non-technical reader.
20. Use the Doctor Fizz diagnostic vocabulary: throttling, suppressing, blocking, dark, invisible, exposed, addressable, gap, ceiling, prescribed, diagnosed, priority sequence, commercial consequence.

NUMBER FORMATTING: Never print a raw API value. Use formatted values only — e.g. "16.9 seconds" not "16887.18 ms"; "0/mo" with a commercial interpretation, never a bare "0"; counts with thousands separators.

STYLE CONSTRAINTS:
- Lead with the finding. State the diagnosis first; do not build up to it.
- Name specific numbers. Never "performance issues" — write "mobile performance score is 46/100, suppressing ranking across every page."
- Connect every finding to a commercial outcome. Complete the sentence: "This matters because…"
- Use the diagnostic vocabulary: throttling, suppressing, dark, blocked, gap, exposed, addressable.
- No first-person brand voice. Never "we recommend" or "our analysis." Use "the data shows," "the priority action is," "the prescribed fix is."
- FORBIDDEN: marketing slogans, "We believe", "In our experience", "consider", "you may want to", "It is worth noting that", "As we can see", "In conclusion", "Moving forward", motivational language, paragraph-length intros that delay the finding.`;

// ── Build the data context block from the structured payload ───────────────────
function buildDataContext(payload) {
  const m  = payload.report_meta || {};
  const b  = payload.baseline || {};
  const kw = payload.keywords || {};
  const ca = payload.content_architecture || {};
  const bl = payload.backlinks || {};
  const gbp = payload.gbp_comparison || {};
  const kpis = payload.kpis || {};
  const tech = payload.technical_issues || [];
  const geo = payload.geo_and_ai_visibility || {};
  const v2 = payload.v2_additions || {};

  // V2: use formatted values + commercial interpretations (never raw values)
  const fmtMap = Object.fromEntries((v2.formatted_baseline || []).map(b2 => [b2.metric, b2]));
  const fieldLine = (label, field) => {
    const fb = fmtMap[field];
    if (fb && fb.formatted_value != null) {
      return `${label}: ${fb.formatted_value}${fb.benchmark_label ? ` (${fb.benchmark_label})` : ""}${fb.commercial_interpretation ? `\n    → ${fb.commercial_interpretation}` : ""}`;
    }
    const f = b[field];
    if (!f || f.value == null) return `${label}: [${f?.label || "unavailable"}]`;
    return `${label}: ${f.value}`;
  };

  const acceptedKw = (kw.accepted || []).slice(0, 25).map(k =>
    `  - "${k.keyword}" | vol ${k.global_volume ?? "?"} | diff ${k.keyword_difficulty ?? "?"} | ${k.intent_class} → ${k.recommended_asset_type} | funnel: ${k.funnel_role} | priority: ${k.priority}`
  ).join("\n");

  const monitoringKw = (kw.brand_monitoring_only || []).slice(0, 10).map(k =>
    `  - "${k.keyword}" (${k.reason})`
  ).join("\n");

  const commercialPages = (ca.commercial_pages || []).map(p =>
    `  - ${p.page_name} (${p.url_slug}) | cluster "${p.keyword_cluster}" vol ${p.primary_volume} | ${p.funnel_role} | ${p.priority}`
  ).join("\n");

  const blogPages = (ca.blog_and_guides || []).map(p =>
    `  - "${p.proposed_title}" | cluster "${p.keyword_cluster}" vol ${p.primary_volume} | ${p.funnel_role}`
  ).join("\n");

  const cityPages = (ca.city_pages || []).map(p =>
    `  - ${p.page_name} (city: ${p.city_target}) | cluster "${p.keyword_cluster}" vol ${p.primary_volume}`
  ).join("\n");

  const citations = (bl.citation_links || []).map(l =>
    `  - ${l.platform} (DR ${l.domain_rating}) | listed: ${l.client_listed ? "YES" : "no"} | ${l.effort_hours} | ${l.signal}`
  ).join("\n");

  const competitorGap = (bl.competitor_gap || []).slice(0, 10).map(l =>
    `  - ${l.referring_domain} → links to ${l.links_to} | ${l.link_type}`
  ).join("\n");

  const gbpRows = [gbp.client, ...(gbp.competitors || [])].filter(Boolean).map(r =>
    `  - ${r.name}: verified=${r.verified} | ${r.review_count} reviews @ ${r.rating ?? "?"}★ | cat: ${r.primary_category ?? "?"} | photos: ${r.photos} | completeness: ${r.completeness ?? "?"}`
  ).join("\n");

  const kpiRows = (kpis.metrics || []).map(k =>
    `  - ${k.metric}: baseline ${k.baseline ?? "unavailable"} → 6mo ${k.target_6_months} → 12mo ${k.target_12_months} [${k.validation_status}] ${k.estimation_note || ""}`
  ).join("\n");

  const competitors = (payload.competitors || []).map(c =>
    `  - ${c.name} (${c.domain}) | threat: ${c.threat_level}`
  ).join("\n");

  return `
═══════════════════════════════════════════════════════
REPORT META
═══════════════════════════════════════════════════════
Client: ${m.client_name} | Domain: ${m.domain} | Industry: ${m.industry}
Report type: ${m.report_type} | Ref: ${m.report_ref} | Date: ${m.report_date}

═══════════════════════════════════════════════════════
BASELINE (validated — labels shown where data unavailable)
═══════════════════════════════════════════════════════
${fieldLine("Domain Rating", "domain_rating")}
${fieldLine("Organic Traffic", "organic_traffic")}
${fieldLine("Organic Keywords", "organic_keywords")}
${fieldLine("Referring Domains", "referring_domains")}
${fieldLine("Mobile Performance", "mobile_performance_score")}
${fieldLine("Desktop Performance", "desktop_performance_score")}
${fieldLine("LCP", "lcp")}
${fieldLine("CLS", "cls")}
${fieldLine("Site Health Score", "site_health_score")}
${fieldLine("GBP Completeness", "gbp_completeness")}
${fieldLine("GBP Reviews", "gbp_review_count")}
${fieldLine("GBP Rating", "gbp_rating")}

═══════════════════════════════════════════════════════
OPPORTUNITY SUMMARY (for executive-summary callout stats — V2)
═══════════════════════════════════════════════════════
Total addressable monthly searches: ${(v2.opportunity_summary?.total_monthly_search_volume ?? 0).toLocaleString()}
Commercial keyword clusters: ${v2.opportunity_summary?.commercial_keyword_count ?? 0}
Quick wins available: ${v2.opportunity_summary?.quick_wins_available ?? 0}
Projected monthly visitors (12m): ${(v2.opportunity_summary?.estimated_traffic_uplift_12m ?? 0).toLocaleString()}
City pages needed: ${v2.opportunity_summary?.city_pages_needed ?? 0}

NON-EXPERT SECTION FRAMES (use as the opening narrative paragraph for each section):
  Keyword strategy: ${v2.non_expert_section_frames?.keyword_strategy_intro || "—"}
  Technical issues: ${v2.non_expert_section_frames?.technical_issues_intro || "—"}
  GBP: ${v2.non_expert_section_frames?.gbp_intro || "—"}
  Authority: ${v2.non_expert_section_frames?.authority_intro || "—"}

SECTION BRIDGES (use verbatim as the last sentence of each section):
${(v2.narrative_connections || []).map(n => `  ${n.section}: ${n.narrative_connection}`).join("\n")}

═══════════════════════════════════════════════════════
COMPETITORS
═══════════════════════════════════════════════════════
${competitors || "  None identified"}

═══════════════════════════════════════════════════════
ACCEPTED KEYWORDS (already classified — do NOT reclassify)
═══════════════════════════════════════════════════════
${acceptedKw || "  None"}

BRAND MONITORING ONLY (NEVER use as content targets):
${monitoringKw || "  None"}

═══════════════════════════════════════════════════════
CONTENT ARCHITECTURE (keep these three separated)
═══════════════════════════════════════════════════════
CORE COMMERCIAL PAGES:
${commercialPages || "  None"}

BLOG & EDUCATIONAL CONTENT:
${blogPages || "  None"}

LOCAL / CITY PAGES:
${cityPages || "  None"}

═══════════════════════════════════════════════════════
BACKLINKS (keep four categories separated)
═══════════════════════════════════════════════════════
CITATION & DIRECTORY:
${citations || "  None"}

COMPETITOR LINK GAP:
${competitorGap || "  None identified"}

═══════════════════════════════════════════════════════
GBP COMPARISON
═══════════════════════════════════════════════════════
${gbpRows || "  No GBP data"}
Biggest gap: ${gbp.biggest_gap || "—"}
Fastest win: ${gbp.fastest_win || "—"}
Trust gap: ${gbp.trust_gap || "—"}

═══════════════════════════════════════════════════════
TECHNICAL ISSUES (ranked, developer-actionable)
═══════════════════════════════════════════════════════
${tech.map(t => `  - [${t.priority}] ${t.issue}${t.affected_count ? ` (${t.affected_count})` : ""} | ${t.estimated_effort} → ${t.recommended_action}`).join("\n") || "  None detected"}

═══════════════════════════════════════════════════════
GEO & AI VISIBILITY
═══════════════════════════════════════════════════════
Current AI citation status: ${geo.current_ai_citation_count || "—"}
Competitor benchmarks: ${(geo.competitor_citation_benchmarks || []).map(c => `${c.competitor}: ${c.estimated_citations}`).join(", ") || "—"}
Recommended actions:
${(geo.recommended_actions || []).map(a => `  - ${a}`).join("\n")}
Schema to implement: ${(geo.schema_additions || []).map(s => s.type).join(", ")}
(Ready-to-use JSON-LD is generated in the structured payload — reference FAQPage + Organization/LocalBusiness.)

═══════════════════════════════════════════════════════
KPI FORECAST (validated — every target improves on baseline)
═══════════════════════════════════════════════════════
${kpiRows || "  None"}
`;
}

// ── Build the section-generation instruction (Part 3 prompts) ─────────────────
function buildSectionInstructions(payload) {
  return `Using the validated data above, generate the Doctor Fizz report. Produce EVERY section below with its exact numbered header. Follow the diagnostic style and all 12 fundamental rules.

## 01 · EXECUTIVE SUMMARY
Diagnosis in short form: the specific problems found, the scale of the opportunity (in concrete numbers), and the 4–6 prescribed actions in priority order. A decision-maker who reads only this must understand the entire strategic situation.

## 02 · PRIORITY ACTION PLAN
Rank ALL actions by impact-to-effort ratio — highest impact, lowest effort first, regardless of section. Group into three tiers: FOUNDATION FIXES (URL/metadata/technical blockers that gate everything else), CONTENT & ON-PAGE WORK, and AUTHORITY & GEO WORK. For each action: one-line description, channel tag [SEO]/[GEO]/[SEO+GEO], priority label (CRITICAL/HIGH/MEDIUM/QUICK WIN), and effort estimate (e.g. "≈30 min", "≈3 hours", "≈1 week"). End with one sentence on why this ordering matters commercially.

## 03 · BASELINE SNAPSHOT
Clinical reading of each baseline metric. For every metric with a value, add one sentence on its commercial implication. For every unavailable field, state the unavailability label and what action captures it — never a dash. Example interpretation depth: "mobile performance of 46/100 is a hard ceiling on every page, because the majority of searches arrive on mobile."

## 04 · COMPETITOR LANDSCAPE
For each competitor: what they do well and why it is hard to replicate, the specific tactics/keywords driving their advantage, and the exploitable gaps the client can win without a head-on contest. Label each by threat level. Identify at least two specific, keyword-or-content-tied gaps. End with a paragraph titled "The Opening" summarizing total addressable opportunity in monthly search-volume terms. Competitor names are diagnostic context only — never content targets.

## 05 · KEYWORD STRATEGY
Organize into: (1) Primary commercial keywords — lead with the best 2–3, with volume/difficulty/ranking; (2) Informational & supporting — how each supports a funnel stage; (3) Local & geo-modified — which pages they map to; (4) Long-tail & feature keywords. Use ONLY accepted keywords. Never use brand-monitoring or excluded terms. End with a coverage note on a strategic observation about the keyword set.

## 06 · CONTENT ARCHITECTURE
Three clearly separated subsections, never merged:
SUBSECTION 1 — Core Commercial Pages: page name, URL slug, primary keyword cluster, why it exists commercially, funnel role, priority. No blog content here.
SUBSECTION 2 — Blog & Educational Content: title, keyword cluster, search intent, funnel fit, how it connects to a commercial page. Every blog must have a stated funnel role.
SUBSECTION 3 — Local & City Pages: page name + city, keyword cluster, why a separate city page is required, priority.
Do not include schema additions here — they belong in the GEO section.

## 07 · TECHNICAL FOUNDATION
Each issue: state the problem precisely with counts/measurements, explain why it matters for SEO (not just that it is an issue), the developer-actionable fix, priority (CRITICAL/HIGH/MEDIUM/LOW), and effort. Rank by priority; criticals first with a directive to fix before new content. For any Core Web Vitals issue, explain ranking impact in terms of % of searches affected. No generic "improve site speed" — say specifically what changes.

## 08 · AUTHORITY & LINK BUILDING
Four clearly labeled subsections, never merged:
SUBSECTION 1 — Citation & Directory Links: platform, DR, client listed?, competitors listed?, effort hours, signal. Explain why citations are the fastest baseline authority move.
SUBSECTION 2 — Editorial & Content-Earned Links: content asset/pitch angle, target publication, production time, link type, why competitors cannot replicate. Explain why these have the highest long-term value.
SUBSECTION 3 — Competitor Link Gap: referring domain, which competitor has the link, link type, approach to earn it. Explain why these are the most strategically direct.
SUBSECTION 4 — Local Authority Links: source type, geographic relevance, local signal, effort. Explain why they punch above their DR weight.

## 09 · LOCAL VISIBILITY & GBP COMPARISON
Begin with the comparison table (client vs every competitor across the provided fields). Then three paragraphs: (1) The biggest visibility gap — the field furthest behind the strongest competitor and why it matters; (2) The fastest win — the field closeable in 48 hours with the exact action; (3) The trust gap — the signal most affecting whether a customer chooses the client when viewing both profiles, with the psychology of the decision. End with a prioritized GBP action list with effort estimates.

## 10 · GEO LAYER & AI VISIBILITY
Explain current AI citation status vs competitor benchmarks and why the client is under-cited. Prescribe: specific on-page changes that improve AI citation probability; the schema additions required (FAQPage JSON-LD, Organization schema, and type-specific schema for this business). Include a COMPLETE, ready-to-implement JSON-LD code block (not a partial template). Cover the four GEO principles: answer-first formatting, entity clarity, consistent definitional language, vocabulary coverage. Tag the section [SEO+GEO] throughout.

## 11 · KPI FORECAST & MEASUREMENT
Present the validated KPI table: baseline, 6-month target, 12-month target, and the estimation note for each. For null baselines, state unavailable and the capture action. Flag any metric whose validation_status indicates manual review. After the table, give measurement guidance: which tool tracks each metric, review cadence, and the week 2–4 early signals that indicate the strategy is working before full ranking gains. Name specific tools and signals.

## 12 · IMPLEMENTATION NOTES & SPRINT PLAN
Time-sequenced sprint plan: Foundation sprint (Day 1 — technical/URL/metadata blockers), Content sprint (Week 1 — content build in priority order), Authority & GEO sprint (Weeks 1–2 — links, schema, AI visibility), and Measurement setup (Week 1 — tools and dashboards). For each sprint: what to do, by when, expected result. Close with a one-sentence framing of the total opportunity and the expected 30/60/90-day outcomes.

Write in direct, expert, diagnostic tone. Use the real numbers from the data above. No filler.`;
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function POST(request) {
  try {
    const body = await request.json();
    const {
      domain, businessData, keywords = [],
      seoData = null, crawlData = null, gmbData = null,
      competitorAudit = null, keywordGap = null,
      doctorFizz = null, // pre-computed Stage-3 payload (preferred)
    } = body;

    if (!domain) return NextResponse.json({ error: "domain required" }, { status: 400 });

    // Prefer a pre-computed structured payload; otherwise build it here so the
    // strategic plan can be generated standalone (Stage 3 → Stage 4 in one call).
    let payload = doctorFizz;
    if (!payload) {
      const competitors = [
        ...(Array.isArray(competitorAudit?.competitors) ? competitorAudit.competitors.map(c => ({ name: c.domain, domain: c.domain })) : []),
      ];
      const rawKeywords = [
        ...(keywordGap?.gapKeywords || []),
        ...(keywordGap?.newOpportunities || []),
        ...(keywordGap?.easyWins || []),
        ...(keywordGap?.targetRanked || []),
        ...(keywordGap?.paaQuestions || []).map(q => ({ keyword: q.question, volume: 0, difficulty: 0.2 })),
      ];
      const competitorGmbs = Array.isArray(competitorAudit?.competitors)
        ? competitorAudit.competitors.filter(c => c?.gmb && !c.gmb.error).map(c => ({ domain: c.domain, name: c.name || c.domain, gmbCheck: c.gmb }))
        : [];

      payload = runBusinessLogic({
        domain,
        clientName: businessData?.businessName || businessData?.name || domain,
        industry:   businessData?.industrySector || businessData?.industry || businessData?.category || "",
        reportType: "website",
        location:   businessData?.location || "India",
        baselineRaw: {
          domainRating:     seoData?.domainRankOverview?.rank ?? null,
          organicTraffic:   seoData?.domainRankOverview?.organicTraffic ?? null,
          organicKeywords:  seoData?.domainRankOverview?.organicKeywords ?? null,
          referringDomains: seoData?.domainRankOverview?.referringDomains ?? null,
          performanceMobile:  seoData?.technicalSeo?.performanceScoreMobile ?? null,
          performanceDesktop: seoData?.technicalSeo?.performanceScoreDesktop ?? null,
          crawlHealthScore:   crawlData?.healthScore ?? null,
          gbpCompletenessScore: gmbData?.completeness?.score ?? null,
          gbpReviewCount:     gmbData?.gmb?.reviewCount ?? null,
          gbpRating:          gmbData?.gmb?.rating ?? null,
        },
        competitors,
        rawKeywords,
        crawlData,
        clientGmb: gmbData,
        competitorGmbs,
        directories: gmbData?.directories || [],
        clientServiceTerms: [businessData?.category, businessData?.specificService, businessData?.offeringType].filter(Boolean),
        targetKeywords: keywords,
      });
    }

    const dataContext = buildDataContext(payload);
    const instructions = buildSectionInstructions(payload);
    const userPrompt = `${dataContext}\n\n${instructions}`;

    const { content } = await claudeChatStream({
      messages: [
        { role: "system", content: MASTER_SYSTEM_PROMPT },
        { role: "user",   content: userPrompt },
      ],
      max_tokens: 8000,
      timeoutMs:  110000,
      model: "claude-sonnet-4-6",
    });

    // Parse numbered sections for structured rendering
    const sections = {};
    const sectionRe = /^##\s*(\d{2})\s*[·.]\s*(.+)$/gm;
    let match;
    const indices = [];
    while ((match = sectionRe.exec(content)) !== null) {
      indices.push({ num: match[1], title: match[2].trim(), start: match.index, headerEnd: sectionRe.lastIndex });
    }
    for (let i = 0; i < indices.length; i++) {
      const cur = indices[i];
      const next = indices[i + 1];
      const bodyText = content.slice(cur.headerEnd, next ? next.start : content.length).trim();
      const key = cur.title.replace(/[^\w\s]/g, "").trim().toLowerCase().replace(/\s+/g, "_");
      sections[key] = { number: cur.num, title: cur.title, body: bodyText };
    }

    // Re-run QA gate WITH the narrative for tone checks
    const qaResult = runQaGate(payload, content);

    return NextResponse.json({
      domain,
      plan: content,
      sections,
      structuredPayload: payload,
      qaResult,
      generatedAt: new Date().toISOString(),
      dataSourcesUsed: {
        seo:            !!seoData,
        crawl:          !!crawlData,
        gmb:            !!gmbData,
        competitorAudit:!!competitorAudit,
        keywordGap:     !!keywordGap,
        businessLogic:  !!payload,
      },
    });
  } catch (err) {
    console.error("[strategic-plan] Error:", err);
    return NextResponse.json({ error: err?.message || "plan generation failed" }, { status: 500 });
  }
}
