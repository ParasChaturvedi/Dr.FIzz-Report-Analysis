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
export const maxDuration = 300; // was 120 → the Claude call exceeded it (504); match generate-analysis

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

21. CONNECT THE METRICS. Never present a number in isolation. Explicitly link it to its cause and its effect using plain cause→effect language: "because X is low, Y happens", "fix X and Y improves too", "this is the direct reason that…". Example: "Your pages load in 16 seconds, so Google scores mobile speed 43/100 and holds every page back — that is the direct reason organic traffic is zero. Lift the speed and those same pages become eligible to rank." Make the whole report read as one connected chain where each problem explains the next.

22. WRITE FOR A COMPLETE BEGINNER. Assume the reader has never done SEO. Explain every concept in everyday words (use a simple analogy where it helps — a website is like a shop, reviews are like word-of-mouth, links are like votes of trust). For every recommendation, make it obvious WHAT to do, HOW to do it in simple steps, and WHY it helps — so a non-technical owner could act on it without an agency. Keep sentences short and concrete.

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
      const gloss = fb.plain_language ? ` (${fb.plain_language})` : "";       // T1: plain-language gloss on first appearance
      const unlocks = fb.what_this_unlocks ? `\n    ⤷ What this unlocks: ${fb.what_this_unlocks}` : ""; // Baseline V2: one-line "What this unlocks"
      return `${label}${gloss}: ${fb.formatted_value}${fb.benchmark_label ? ` (${fb.benchmark_label})` : ""}${fb.commercial_interpretation ? `\n    → ${fb.commercial_interpretation}` : ""}${unlocks}`;
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

  const cityPages = (ca.geography_pages || ca.city_pages || []).map(p =>
    `  - ${p.page_name} (${p.page_type || "geography page"}${(p.geo_target || p.city_target) ? `: ${p.geo_target || p.city_target}` : ""}) | cluster "${p.keyword_cluster}" vol ${p.primary_volume}`
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

GEOGRAPHY PAGES (country / region / city — use the narrowest scope per cluster, never default to "city"):
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
${tech.map(t => `  - [${t.priority}] ${t.issue}${t.affected_count ? ` (${t.affected_count})` : ""} | ${t.estimated_effort}\n      Why it matters: ${t.why_it_matters || "—"}\n      Fix: ${t.recommended_action}\n      Expected unlock: ${t.expected_unlock || "—"}`).join("\n") || "  None detected"}

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
  return `Using the validated data above, generate the Doctor Fizz report following the V3 storytelling architecture. The report must read as ONE guided business story: where the business stands now → the opportunity → what is blocking growth → who competes → where demand sits → what to build → what to fix → how to build authority → local → AI → the plan → what good looks like. Produce EVERY section below with its exact numbered header. Each section does ONE job, opens with a diagnosis, translates metrics into business meaning, frames every table before and after, and hands off to the next section. Follow the diagnostic style and all fundamental + storytelling rules.

## 01 · THE SITUATION
Where the business stands in search RIGHT NOW, as a standalone summary a decision-maker can read alone. State the overall visibility position in plain language: how visible or invisible the site is today, the headline health/baseline reading, and — most importantly — what that currently costs the business commercially. Lead with the finding, name the single most critical issue, and close on the size of what is at stake. No jargon dumps.

## 02 · THE OPPORTUNITY
The size and shape of the addressable upside, in plain business language. Present, as the "what you are leaving on the table" numbers: total addressable monthly search demand, number of commercial opportunities, number of geography opportunities, quick wins available, and the projected 6- and 12-month upside range. Each number gets a business-owner label, not an SEO label. This is the section that makes the opportunity feel concrete and winnable.

## 03 · WHAT IS BLOCKING GROWTH
Consolidate the major ceilings BEFORE the detailed sections, so the reader understands the blockers as a set. Cover, in plain language and only where relevant: the technical ceiling, the content ceiling, the trust/authority ceiling, the local ceiling, and the AI-citation ceiling. For each, one tight paragraph: what the ceiling is, the evidence (named metric), and the combined commercial effect. This is the bridge from opportunity to the detailed prescription that follows.

## 04 · WHO ACTUALLY COMPETES WITH YOU
Split clearly into: (a) BUSINESS COMPETITORS — validated direct rivals who get full head-to-head treatment (what they do well and why it is hard to replicate, the tactics/keywords driving their edge, and at least two exploitable gaps the client can win); label each by threat level; (b) SEARCH INTERCEPTORS & PLATFORM THREATS — directories, marketplaces, review sites and other ranking domains explained as search-market CONTEXT only, never as commercial rivals to overtake. End with "The Opening": the total addressable opportunity in monthly search-volume terms. Competitor names are diagnostic context only — never content targets.

## 05 · WHERE THE DEMAND SITS
Open with a short non-expert explanation of what the demand groups mean and why each maps to a different asset type. Then organise accepted keywords by intent and geography: (1) Primary commercial demand — lead with the best 2–3, with volume/difficulty/ranking; (2) Informational & supporting — how each supports a funnel stage; (3) Local & geo-modified demand — which geography pages they map to; (4) Country-/region-specific demand where applicable. Use ONLY accepted keywords. Never use brand-monitoring or excluded terms. Close with the single best opportunity and why.

## 06 · WHAT PAGES NEED TO EXIST
Three clearly separated subsections, never merged:
SUBSECTION 1 — Core Commercial Pages: page name, URL slug, primary keyword cluster, why it exists commercially, funnel role, priority. No blog content here.
SUBSECTION 2 — Supporting Educational Content: title, keyword cluster, search intent, funnel fit, how it connects to a commercial page. Every item must have a stated funnel role.
SUBSECTION 3 — Geography Pages: page name + geography target and its scope (country / region / city — use the narrowest scope the demand supports, do NOT default everything to "city"), keyword cluster, why a separate geography page is required, priority.
Do not include schema additions here — they belong in the GEO section.

## 07 · WHAT MUST BE FIXED FIRST
Technical and structural fixes in strict priority order. For EACH issue give all five: the Issue (precise, with counts/measurements); Why it matters (SEO + commercial consequence, not just "it is an issue"); What to do (developer-actionable fix); Estimated effort; Expected unlock (what improves once fixed). Rank by priority; criticals first with a directive to fix before new content. For any Core Web Vitals issue, explain ranking impact in terms of % of searches affected. No generic "improve site speed".

## 08 · HOW AUTHORITY WILL BE BUILT
Four clearly labeled subsections, never merged:
SUBSECTION 1 — Citation & Directory Links: platform, DR, client listed?, competitors listed?, effort hours, signal. Explain why citations are the fastest baseline authority move.
SUBSECTION 2 — Editorial & Content-Earned Links: content asset/pitch angle, target publication, production time, link type, why competitors cannot replicate. Explain why these have the highest long-term value.
SUBSECTION 3 — Competitor Link Gap: referring domain, which competitor has the link, link type, approach to earn it. Explain why these are the most strategically direct.
SUBSECTION 4 — Local Authority Links: source type, geographic relevance, local signal, effort. Explain why they punch above their DR weight.

## 09 · LOCAL AND LOCATION VISIBILITY
(Conditional — include only when local/geography scope exists.) Begin with the comparison table (client vs every VALIDATED business competitor across the provided fields — never directories or search interceptors). Then three paragraphs: (1) The biggest visibility gap and why it matters; (2) The fastest win — closeable in 48 hours, with the exact action; (3) The trust gap — the signal most affecting whether a customer chooses the client when viewing both profiles, with the decision psychology. End with a prioritized GBP action list with effort estimates.

## 10 · GEO AND AI VISIBILITY
Explain current AI citation status vs competitor benchmarks and why the client is under-cited. Prescribe: specific on-page changes that improve AI citation probability; the schema additions required (FAQPage JSON-LD, Organization schema, and type-specific schema). Include a COMPLETE, ready-to-implement JSON-LD code block (not a partial template). Cover the four GEO principles: answer-first formatting, entity clarity, consistent definitional language, vocabulary coverage. Tie the work directly back to page creation and authority-building. Tag the section [SEO+GEO] throughout.

## 11 · PRIORITY PLAN
Translate the ENTIRE report into execution order — this is the synthesis section. Sequence the work as: Foundation fixes → Commercial pages → Geography pages → Supporting content → Authority work → GEO work. Rank by impact-to-effort. For each action: one-line description, channel tag [SEO]/[GEO]/[SEO+GEO], priority label (CRITICAL/HIGH/MEDIUM/QUICK WIN), and effort estimate (e.g. "≈30 min", "≈3 hours", "≈1 week"). Then give the time-sequenced view: Foundation sprint (Day 1), Content sprint (Week 1), Authority & GEO sprint (Weeks 1–2), Measurement setup (Week 1). End with one sentence on why this ordering matters commercially.

## 12 · WHAT GOOD LOOKS LIKE
The closing anchor. Present the validated KPI table (baseline, 6-month target, 12-month target, estimation note) — for null baselines state the unavailability label and the capture action, never a dash; flag any metric needing manual review. Add measurement guidance: which tool tracks each metric, review cadence, and the week 2–4 early signals. Then close with the future-state narrative describing BOTH the 6-month and 12-month state — for each milestone name the specific metric values AND translate them into a business consequence (enquiries, customers, revenue position), framing month 6 as early momentum and month 12 as full realisation.

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
