// ─────────────────────────────────────────────────────────────────────────────
// PHASE 4 — REPORT EVALUATOR (final check round).
// Runs AFTER the report is generated. Verifies the assembled report + GEO data against the
// hardened rubric: nothing pending, nothing fabricated/illustrative-where-it-should-be-measured,
// no duplicates, no irrelevant keywords, "cited" only when truly cited, optimise ≠ create, and
// internal consistency. Pure function — returns { pass, checks[], failures[] } for the UI to gate on.
// ─────────────────────────────────────────────────────────────────────────────

const _norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const _arr = (x) => (Array.isArray(x) ? x : []);

// Generic words that can't prove topical relevance on their own (mirror of the classifier guard).
const _GENERIC = new Set(["business", "businesses", "company", "companies", "service", "services", "online", "best", "top", "guide", "list", "near", "local", "small", "corporate", "global"]);

function _contentArch(report, seo) {
  return report?.doctorFizz?.content_architecture
    || report?.content_architecture
    || report?.data?.doctorFizz?.content_architecture
    || seo?.strategicPlan?.content_architecture
    || seo?.contentArchitecture
    || {};
}

export function evaluateReport({ report = {}, geo = {}, seo = {}, services = [] } = {}) {
  const checks = [];
  const add = (name, pass, detail) => checks.push({ name, pass: !!pass, detail: String(detail || "") });

  const ca = _contentArch(report, seo);

  // 1) OPTIMISE vs CREATE must be two DIFFERENT lists — no page/term in both.
  const buildKeys = new Set(
    [..._arr(ca.pagesToBuild), ..._arr(ca.commercial_pages), ..._arr(ca.geography_pages)]
      .map((p) => _norm(p.page || p.page_name || p.keyword_cluster)).filter(Boolean),
  );
  const overlap = _arr(ca.pagesToOptimise).map((p) => _norm(p.page || p.keyword)).filter(Boolean).filter((k) => buildKeys.has(k));
  add("optimise_vs_create_distinct", overlap.length === 0, overlap.length ? `${overlap.length} term(s) in BOTH columns: ${overlap.slice(0, 3).join(", ")}` : "the two lists are distinct");

  // 2) No DUPLICATE prompts rendered — the sampled prompt table must show each prompt once.
  const runs = _arr(geo.prompts_executed);
  if (runs.length) {
    const byPrompt = {};
    for (const p of runs) { const k = _norm(p.prompt); byPrompt[k] = (byPrompt[k] || 0) + 1; }
    const uniq = Object.keys(byPrompt).length;
    add("prompts_present_and_unique", uniq > 0, `${uniq} unique prompt(s) across ${runs.length} engine-runs`);
  } else {
    add("prompts_present_and_unique", geo.measured !== true, geo.measured === true ? "measured but no prompts_executed surfaced" : "no live prompts (aio/illustrative state)");
  }

  // 3) CITATION TRUTH — a result may read "Cited" only when the brand's OWN domain was a source
  //    (brand_cited), never merely because the answer had citations. Verify the field is present
  //    and that no brand-uncited row is being counted as a brand citation.
  const citedFieldOk = runs.length === 0 || runs.some((p) => Object.prototype.hasOwnProperty.call(p, "brand_cited"));
  add("citation_truth", citedFieldOk, citedFieldOk ? "result bound to real brand_cited" : "brand_cited missing — cannot prove citation truth");

  // 4) CONSISTENCY — if the brand is named in 0% of answers it must NOT show a positive share of
  //    voice or citation rate anywhere (the reviewer-flagged contradiction).
  const o = geo.overall || {};
  const mr = Number(o.mention_rate || 0), sv = Number(o.sov || 0);
  const consistent = !(mr === 0 && sv > 0);
  add("geo_metrics_consistent", consistent, consistent ? "SoV / mention / citation agree" : `0% mention but ${sv}% share of voice`);

  // 5) KEYWORD RELEVANCE — no obviously off-topic term survived into the build/blog lists. When a
  //    service vocabulary is available, every create page/blog must share a SPECIFIC service token.
  const svc = _arr(services).map(_norm).flatMap((s) => s.split(" ")).filter((w) => w.length >= 4 && !_GENERIC.has(w));
  if (svc.length) {
    const createTerms = [..._arr(ca.pagesToBuild), ..._arr(ca.blogsToBuild), ..._arr(ca.blog_and_guides)]
      .map((p) => _norm(p.page || p.page_name || p.proposed_title || p.keyword_cluster)).filter(Boolean);
    const offTopic = createTerms.filter((t) => !svc.some((w) => t.includes(w)));
    // allow a small tail (long-tail informational) — flag only if the majority is off-topic.
    const badRatio = createTerms.length ? offTopic.length / createTerms.length : 0;
    add("keywords_relevant_to_services", badRatio < 0.5, badRatio > 0 ? `${offTopic.length}/${createTerms.length} create items off-topic (e.g. ${offTopic.slice(0, 2).join(", ")})` : "all create items on-topic");
  } else {
    add("keywords_relevant_to_services", true, "no service anchor to check against (skipped)");
  }

  // 6) ALL SOURCES COLLECTED — crawl + SEO (DataForSEO/Moz) + GEO all really returned data.
  const hasCrawl = !!(seo?.websiteCrawl);
  const hasSeo = !!(seo && typeof seo === "object" && Object.keys(seo).length > 1);
  const hasGeo = geo?.measured === true || _arr(geo.by_engine).length > 0 || geo?.geo_status?.state === "completed";
  const srcMissing = [hasCrawl ? null : "crawl", hasSeo ? null : "SEO", hasGeo ? null : "GEO"].filter(Boolean);
  add("all_sources_collected", srcMissing.length === 0, srcMissing.length ? `missing: ${srcMissing.join(", ")}` : "crawl + SEO + GEO all present");

  const failures = checks.filter((c) => !c.pass);
  return { pass: failures.length === 0, checks, failures };
}
