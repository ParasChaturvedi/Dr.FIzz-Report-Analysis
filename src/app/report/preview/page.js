// src/app/report/preview/page.js — DEV-ONLY visual harness for the deck replica.
// Renders DeckReport against a representative fixture (no live GEO → GEO slides show
// the honest not-measured panel). Used to verify design-system fidelity + bindings.
"use client";

import DeckReport from "@/app/components/report/deck/DeckReport";

const FIX = {
  domain: "acenteus-cca.com",
  generatedAt: "2026-06-25T10:00:00Z",
  businessData: { name: "Acenteus Accounting", city: "Brighton" },
  baselineMetrics: {
    domain_rating: { value: 10 }, organic_traffic: { value: 0 }, organic_keywords: { value: 0 },
    referring_domains: { value: 43 }, total_backlinks: { value: 70 },
    mobile_performance_score: { value: 30 }, desktop_performance_score: { value: 43 },
    lcp: { value: 21800 }, cls: { value: 0.05 }, site_health_score: { value: 77 },
    gbp_completeness: { value: 67 }, gbp_review_count: { value: 8 }, gbp_rating: { value: 5 }, errors_404: { value: 5 },
  },
  doctorFizz: {
    story: {
      the_situation: ["Acenteus has zero organic traffic and zero ranking keywords, on a Domain Rating of 10 — effectively invisible to Google."],
      whats_blocking_growth: ["Broken pages and redirect chains make the site hard to crawl, so it stays invisible; weak signals stack up — DR 10, 43 referring domains, a 21.8s load, 8 reviews vs 253."],
      the_opportunity: ["About 4,000 searches a month are up for grabs. Even the market leader has not cracked the commercial rankings — the opening for Acenteus."],
      what_good_looks_like: ["~241 organic visits by month six, ~482 by month twelve, Domain Rating rising from 10 toward 25, AI citations from zero into double digits."],
    },
    v2_additions: { opportunity_summary: { total_monthly_search_volume: 4020, commercial_keyword_count: 4, estimated_traffic_uplift_6m: 241, estimated_traffic_uplift_12m: 482, city_pages_needed: 1 } },
    ai_readiness: { score: 92, band: "Strong", signals: [
      { key: "structured_data", label: "Structured data (schema)", ok: true, detail: "organization, faqpage, service" },
      { key: "faq_coverage", label: "Answer-first / FAQ coverage", ok: true, detail: "11 FAQ blocks" },
      { key: "entity_identity", label: "Entity identity (sameAs)", ok: true, detail: "19 sameAs links" },
      { key: "nap", label: "NAP consistency", ok: true, detail: "present across GMB + site" },
      { key: "about", label: "About / entity page", ok: true, detail: "present" },
      { key: "depth", label: "Content depth", ok: true, detail: "avg 1074 words/page" },
      { key: "author", label: "Author / E-E-A-T", ok: false, detail: "no named authors" },
    ] },
    gbp_comparison: {
      has_competitor_data: true,
      client: { name: "Acenteus", review_count: 8, rating: 5 },
      competitors: [{ name: "QX Accounting", review_count: 253, rating: 3.9 }, { name: "Outsourced Accounting Svcs", review_count: 131, rating: 5 }, { name: "AccountingFirms", review_count: 75, rating: 4.9 }],
      field_analysis: [
        { label: "Verified & claimed", client_status: "good" }, { label: "Phone & address", client_status: "good" },
        { label: "5★ rating live", client_status: "best" }, { label: "Photos present", client_status: "good" },
        { label: "Business hours", client_status: "missing" }, { label: "Replies to reviews", client_status: "missing" },
        { label: "Q&A answered", client_status: "missing" }, { label: "Weekly posts", client_status: "missing" },
      ],
      review_intel: { review_gap: 245 },
    },
  },
  competitorLandscape: {
    localCompetitors: [
      { name: "Outsourced Accounting Services", domain: "outsourcedaccountingservices.co.uk", strength: "high", description: "A direct UK rival in the same outsourced-accounting niche, already ranking for service terms." },
      { name: "Acobloom", domain: "acobloom.com", strength: "medium", description: "Cited in Google's AI Overview for 'outsourced bookkeeping for accounting firms' — your headline keyword." },
    ],
    nationalPlatforms: [
      { name: "QX Accounting Services", description: "The national heavyweight; owns zero-difficulty 'outsourcing tax' terms plus brand searches.", threat: "THREAT ALERT" },
    ],
    localOpening: "Your competitors operate nationally — none lead with Brighton or local UK presence, and your 5★ rating already beats most. Own 'outsourced accounting for accountants in Brighton' long-tails that QX and Acobloom ignore.",
  },
  contentArchitecture: {
    commercial_pages: [
      { keyword_cluster: "outsourcing tax", primary_volume: 2900, page_name: "Outsourced Tax Prep", url_slug: "/outsourced-tax-preparation", commercial_reason: "The fastest win. Owned only by QX. Rank in 4–6 weeks." },
      { keyword_cluster: "outsourced payroll uk", primary_volume: 720, page_name: "Outsourced Payroll for UK Firms", url_slug: "/outsourced-payroll-uk", commercial_reason: "High-margin niche. A focused page wins it." },
      { keyword_cluster: "white label bookkeeping uk", primary_volume: 300, page_name: "White-Label Bookkeeping", url_slug: "/white-label-bookkeeping", commercial_reason: "Practice owners searching for a partner." },
    ],
    geography_pages: [{ keyword_cluster: "outsourced accounting brighton", primary_volume: 150, page_name: "Outsourced Accounting Brighton", url_slug: "/outsourced-accounting-brighton", geography_relevance: "Local", why_separate_page: "The uncontested flag. 5★ reviews featured. Into the map pack." }],
    blog_and_guides: [
      { keyword_cluster: "what does a cloud accountant do", primary_volume: 1200, proposed_title: "What Does a Cloud Accountant Do?" },
      { keyword_cluster: "cloud accounting services", primary_volume: 2000, proposed_title: "What Are Cloud-Based Accounting Services?" },
    ],
    checklist: ["Exact-intent H1 and meta", "800–1,500 unique words", "5–8 FAQs plus schema", "Strong CTA above the fold", "Internal links and alt text", "Sub-2.5s load time"],
    pagesExistingFlagged: 2,
  },
  technicalPriorities: [
    { priority: "HIGH", issue: "A 21.8-second load time", recommended_action: "Compress hero images and lazy-load to break the 21.8s barrier.", affected_count: 1, why_it_matters: "Visitors and Google leave before the page renders.", expected_unlock: "Indexing", estimated_effort: "≈1 week" },
    { priority: "HIGH", issue: "No H1 on the homepage", recommended_action: "Add one keyword-rich H1.", affected_count: 3, why_it_matters: "Google can't tell what the page is about.", expected_unlock: "Rankable", estimated_effort: "≈1 hour" },
    { priority: "MEDIUM", issue: "5 broken links, 2 orphan pages", recommended_action: "301-redirect broken URLs; connect orphan pages.", affected_count: 5, why_it_matters: "Crawlers can't reach or trust the site.", expected_unlock: "Health 77→90", estimated_effort: "≈2 hours" },
    { priority: "MEDIUM", issue: "101 images missing alt text", recommended_action: "Add descriptive alt text to every image.", affected_count: 101, why_it_matters: "Affects accessibility and image search.", expected_unlock: "Crawlability", estimated_effort: "≈3 hours" },
  ],
  linkBuilding: { citation_links: [
    { platform: "Google Business", client_listed: false }, { platform: "Yelp UK", client_listed: false }, { platform: "ICAEW", client_listed: false },
    { platform: "ACCA", client_listed: false }, { platform: "AccountingWEB", client_listed: false }, { platform: "Brighton Chamber", client_listed: false },
    { platform: "Trustpilot", client_listed: false }, { platform: "Clutch", client_listed: true }, { platform: "Facebook", client_listed: true },
  ] },
  gmbCheck: { gmb: { rating: 5, reviewCount: 8 }, completeness: { score: 67 }, directories: [] },
  roadmap: [
    { timeframe: "First 30 Days", title: "Foundation", actions: [{ title: "Cut load time toward sub-2.5s", description: "Compress hero images and lazy-load." }, { title: "Add the homepage H1 and meta" }, { title: "Repair links and orphan pages" }] },
    { timeframe: "Days 31–60", title: "Capture", actions: [{ title: "Publish the low-difficulty tax page", description: "Target 'outsourcing tax' (2.9K/mo)." }, { title: "Ship two more service pages" }, { title: "Add the lead form and CTA" }] },
    { timeframe: "Days 61–90", title: "Authority", actions: [{ title: "Launch Brighton and FAQ pages" }, { title: "GBP to 100%, 5 citations" }, { title: "Launch the cost calculator" }] },
    { timeframe: "Days 91–180", title: "Compound", actions: [{ title: "Ship payroll, VAT, CFO pages" }, { title: "Run the report for press" }, { title: "Earn 10–15 new domains" }] },
  ],
  measuringSuccessRows: [
    { metric: "Domain Rating", key: "domain_rating", baseline: 10, target_6_months: 15, target_12_months: 25 },
    { metric: "Organic Traffic", key: "organic_traffic", baseline: 0, target_6_months: 241, target_12_months: 482 },
    { metric: "Organic Keywords", key: "organic_keywords", baseline: 0, target_6_months: 30, target_12_months: 60 },
    { metric: "Referring Domains", key: "referring_domains", baseline: 43, target_6_months: 58, target_12_months: 83 },
  ],
  strategicPriorities: [
    { title: "Fix the 21.8s Load & Basic Indexing", description: "With LCP near 22s, Google and visitors abandon before load — this alone explains the 0 traffic." },
    { title: "Win the KD-0 Tax-Outsourcing Keywords", description: "'outsourcing tax' gets 2.9K/mo at zero difficulty, owned only by QX. A single page ranks fast." },
    { title: "Own Brighton + AI Overviews", description: "No rival leads with Brighton; combine local pages with answer-first FAQ content for AI citation." },
  ],
};

export default function DeckPreview() {
  // Dev-only visual harness — never ship the fixture to production.
  if (process.env.NODE_ENV === "production") return null;
  return <DeckReport data={FIX} live={null} />;
}
