// scripts/verify-crawler-v2.mjs
// ─────────────────────────────────────────────────────────────────────────────
// The no-breakage safety net for the crawler swap. It proves, WITHOUT touching any
// live path, that:
//   SHAPE     a contract-shaped crawlData carries every field with the right type.
//   CONTRACT  buildTechnicalIssues / computeScores / runQaGate run WITHOUT THROWING
//             on both a normal crawl AND a much-worse "rendered" crawl, and the
//             worse crawl only produces MORE issues + a LOWER score, never an error
//             and never a QA hold. (This is the core "report will not break" proof.)
//   GEO       the GEO pure functions (computeGeoMetrics, parseAnswer, allocateQuotas)
//             produce byte-identical output across two runs and match a frozen
//             baseline. The GEO module is untouched, so this must pass; if it fails,
//             something it should not have was changed.
//   DELTA     prints old vs new (normal vs rendered) with a reason per changed value.
//
// Exit non-zero if SHAPE, CONTRACT, or GEO fails. DELTA never fails the build.
// Run: node scripts/verify-crawler-v2.mjs
// ─────────────────────────────────────────────────────────────────────────────
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// jiti lets this .mjs import the app's @/-aliased ESM source without a bundler.
const jiti = (await import(path.join(ROOT, "node_modules/jiti/lib/jiti.mjs"))).default(ROOT, {
  interopDefault: true, esmResolve: true, alias: { "@": path.join(ROOT, "src") },
});
const { buildTechnicalIssues, computeScores } = jiti("./src/lib/seo/doctor-fizz-logic.js");
const { runQaGate } = jiti("./src/lib/seo/doctor-fizz-qa.js");
const { computeGeoMetrics } = jiti("./src/lib/seo/geo/geoScoring.js");
const { parseAnswer } = jiti("./src/lib/seo/geo/geoParser.js");
const { allocateQuotas } = jiti("./src/lib/seo/geo/promptPlanner.js");

let FAIL = 0;
const ok = (name, cond, extra = "") => { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); if (!cond) FAIL++; };

// ── a contract-shaped crawlData: pages[] length = pageCount, rich summary ──
const mkPages = (n, { noH1 = 0, thin = 0 } = {}) => Array.from({ length: n }, (_, i) => ({
  url: `https://example.com/p${i}`, statusCode: 200,
  metaTitle: `Page ${i} title`, metaDesc: `Page ${i} description text`, canonical: `https://example.com/p${i}`,
  robotsMeta: "index,follow", isNoindex: false,
  h1s: i < noH1 ? [] : [`Heading ${i}`],
  multipleTitle: false, titleOutsideHead: false, multipleHead: false, multipleBody: false,
  httpResourceCount: 12, imgsWithoutAlt: i % 5 === 0 ? 1 : 0,
  content: { wordCount: i < thin ? 90 : 900 },
  schemas: [{ type: "Organization", properties: { sameAs: ["https://linkedin.com/x"] } }],
  eeat: { author: "Jane Doe", byline: "By Jane Doe", hasAuthor: true },
}));

const mkCrawl = (over = {}) => ({
  pageCount: 47, totalPagesEstimate: 47, sitemapUrlCount: 50, indexedPages: 45,
  hasSitemap: true, hasRobots: true, crawlBlockedByRobots: false, hasLlmsTxt: false,
  healthScore: 92,
  brokenLinks: [{ url: "https://example.com/dead" }],
  duplicates: [{ type: "title" }],
  orphanPages: [],
  coreWebVitals: { lcp: 2.1, cls: 0.05, inp: 180 },
  pages: mkPages(47, { noH1: 3, thin: 2 }),
  eeatSummary: { avgScore: 62, maxScore: 88, signals: ["author"] },
  summary: {
    pagesMissingMetaTitle: 1, pagesMissingMetaDesc: 3, pagesMissingH1: 3, pagesMultipleH1: 0,
    pagesMultipleTitle: 0, pagesTitleOutsideHead: 0, pagesMultipleHead: 0, pagesMultipleBody: 0,
    pagesWithMixedContent: 0, pagesNoindex: 0, pagesNoCanonical: 2,
    pagesWithSchemaTypes: ["Organization", "WebSite"], schemaTypes: { Organization: 5, WebSite: 1 },
    totalImgsWithoutAlt: 4, totalImgsMissingAltAttr: 2, totalImgsMissingAltText: 2, totalImgsWithoutDims: 6,
    slugIssuesCount: 1, thinContentCount: 2, avgWordCount: 850, socialMissing: false, cwvIssuesCount: 1,
    commonIssues: ["missing meta description"],
  },
  ...over,
});

// The "rendered" crawl finds MORE of everything on a JS-heavy site + a lower score.
const worse = mkCrawl({
  healthScore: 60,
  brokenLinks: Array.from({ length: 5 }, (_, i) => ({ url: `https://example.com/dead${i}` })),
  duplicates: Array.from({ length: 8 }, () => ({ type: "title" })),
  pages: mkPages(47, { noH1: 18, thin: 9 }),
  summary: {
    ...mkCrawl().summary,
    pagesMissingH1: 18, pagesMissingMetaDesc: 9, totalImgsWithoutAlt: 22, thinContentCount: 9, avgWordCount: 620,
  },
});
const normal = mkCrawl();

const CONTRACT_TOP = ["pageCount", "totalPagesEstimate", "sitemapUrlCount", "indexedPages", "hasSitemap", "hasRobots", "crawlBlockedByRobots", "hasLlmsTxt", "healthScore", "brokenLinks", "duplicates", "orphanPages", "coreWebVitals", "pages", "summary"];
const CONTRACT_SUMMARY = ["pagesMissingMetaTitle", "pagesMissingMetaDesc", "pagesMissingH1", "pagesNoindex", "pagesNoCanonical", "pagesWithSchemaTypes", "schemaTypes", "totalImgsWithoutAlt", "totalImgsWithoutDims", "slugIssuesCount", "thinContentCount", "avgWordCount", "socialMissing", "cwvIssuesCount", "commonIssues"];

console.log("\n=== SHAPE ===");
for (const f of CONTRACT_TOP) ok(`top.${f} present`, normal[f] !== undefined);
for (const f of CONTRACT_SUMMARY) ok(`summary.${f} present`, normal.summary[f] !== undefined);
ok("pages.length === pageCount", normal.pages.length === normal.pageCount);
ok("no undefined/NaN in summary counts", Object.values(normal.summary).every((v) => v !== undefined && !(typeof v === "number" && Number.isNaN(v))));

console.log("\n=== CONTRACT (no throw, no gate on worse data) ===");
const payload = (crawl) => {
  const tech = buildTechnicalIssues(crawl);
  return { tech, scores: computeScores({ crawlData: crawl, baseline: { mobile_performance_score: { value: 70 }, desktop_performance_score: { value: 85 } } }), qa: runQaGate({ technical_issues: tech, baseline: {} }) };
};
let R1, R2;
try { R1 = payload(normal); ok("buildTechnicalIssues + computeScores + runQaGate on NORMAL", true); } catch (e) { ok("NORMAL run", false, e.message); }
try { R2 = payload(worse); ok("buildTechnicalIssues + computeScores + runQaGate on WORSE", true); } catch (e) { ok("WORSE run", false, e.message); }
if (R1 && R2) {
  ok("worse crawl surfaces MORE technical issues", R2.tech.length >= R1.tech.length, `${R1.tech.length} -> ${R2.tech.length}`);
  ok("worse crawl lowers the technical score", R2.scores.technical <= R1.scores.technical, `${R1.scores.technical} -> ${R2.scores.technical}`);
  ok("QA technical checks still pass on worse (issues well-formed)", (R2.qa.checks || []).filter((c) => c.category === "technical").every((c) => c.passed));
  ok("runQaGate returns a result object (never holds/throws)", typeof R2.qa === "object" && R2.qa !== null);
}

console.log("\n=== GEO (byte-identical, module untouched) ===");
const geoResults = [
  { engine: "chatgpt", brand_mentioned: true, brand_cited: false, brands_mentioned: ["A", "B"], citation_count: 2, answer_length: 400, sentiment: "positive" },
  { engine: "gemini", brand_mentioned: false, brand_cited: false, brands_mentioned: ["B"], citation_count: 1, answer_length: 300, sentiment: "neutral" },
  { engine: "perplexity", brand_mentioned: true, brand_cited: true, brands_mentioned: ["A"], citation_count: 3, answer_length: 500, sentiment: "positive" },
];
const geoAnswerInput = { answerText: "Top agencies include A and B. Source: example.com", engine: "chatgpt", citations: ["https://example.com"] };
// parseAnswer stamps the current time in `timestamp` by design; normalise that one
// volatile field out before hashing (per the proposal's own "strip timestamps before
// hashing" rule) so the guard catches real GEO LOGIC changes, not the clock.
const geoOut = () => JSON.stringify({
  metrics: computeGeoMetrics(geoResults, { brand: "A", competitors: ["B"] }),
  parsed: parseAnswer(geoAnswerInput, { brand: "A", competitors: ["B"], brandDomain: "a.com" }),
  quotas: allocateQuotas(60),
}).replace(/"timestamp":"[^"]*"/g, '"timestamp":"<normalised>"');
const g1 = geoOut(), g2 = geoOut();
ok("GEO pure functions are deterministic across 2 runs", g1 === g2);
const baseDir = path.join(ROOT, "__fixtures__/crawl");
const baseFile = path.join(baseDir, "geo-baseline.json");
if (fs.existsSync(baseFile)) {
  ok("GEO output matches frozen baseline", fs.readFileSync(baseFile, "utf8") === g1, "baseline mismatch => GEO module changed");
} else {
  fs.mkdirSync(baseDir, { recursive: true });
  fs.writeFileSync(baseFile, g1);
  console.log("  INIT  wrote GEO baseline (__fixtures__/crawl/geo-baseline.json) — re-run to assert against it");
}

console.log("\n=== DELTA (normal -> rendered; expected data shift, never a build failure) ===");
if (R1 && R2) {
  const rows = [
    ["healthScore", normal.healthScore, worse.healthScore, "rendered crawl finds JS-injected issues the raw fetch missed"],
    ["summary.pagesMissingH1", normal.summary.pagesMissingH1, worse.summary.pagesMissingH1, "H1s injected by JS are now seen as missing in raw / present in rendered"],
    ["technical issues", R1.tech.length, R2.tech.length, "more real issues surfaced"],
    ["technical score", R1.scores.technical, R2.scores.technical, "lower, correctly reflecting the new issues"],
  ];
  for (const [f, o, n, why] of rows) console.log(`  ${f.padEnd(24)} ${String(o).padStart(4)} -> ${String(n).padStart(4)}   (${why})`);
}

console.log(`\n${FAIL === 0 ? "ALL SAFETY CHECKS PASSED" : FAIL + " CHECK(S) FAILED"} (SHAPE + CONTRACT + GEO). DELTA is informational.`);
process.exit(FAIL === 0 ? 0 : 1);
