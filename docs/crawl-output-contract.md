# Crawl Output Contract (v1)

The shape `website-crawl` returns as `crawlData`, and that every downstream consumer
depends on. Any replacement crawler (the adapter in `src/lib/crawl/toLegacyCrawlData.js`)
MUST reproduce this exact shape. Every field present on every run: a count with no
data is `0`, an array with no data is `[]`, an object is `{}`. Never `undefined`, never
`null` (except where noted).

Source of truth: grepped from `doctor-fizz-logic.js`, `doctor-fizz-qa.js`,
`report-evidence.js`, the report routes, and `WebsiteReport.js`. This list is a
SUPERSET of, and corrects, the shorter list in the crawler-v2 proposal (which omitted
the fields marked `[proposal missed this]` below). Dropping any of them does NOT throw
(every consumer is defensively guarded) but silently removes an issue row, a signal, or
a piece of "exact URLs to fix" evidence, so parity requires all of them.

## Top level

| Field | Type | Consumed by / note |
|---|---|---|
| `pageCount` | number | site-size framing; QA completeness (`pageCount >= 1` is the only hard-ish crawl check, and it is non-blocking) |
| `totalPagesEstimate` | number | site-size framing |
| `sitemapUrlCount` | number | siteSize fallback chain `[proposal missed this]` |
| `indexedPages` | number | siteSize fallback chain (DataForSEO `site:` count) `[proposal missed this]` |
| `hasSitemap` | boolean | healthScore (-10 if false); AI-readiness |
| `hasRobots` | boolean | technical issues |
| `crawlBlockedByRobots` | boolean | healthScore (-20/-30 if true); technical issues |
| `hasLlmsTxt` | boolean | `buildAiReadiness` llms.txt signal (weight 5) `[proposal missed this]` |
| `healthScore` | number | Technical pillar (`computeScores`); MUST reproduce the exact formula (see below) |
| `brokenLinks` | array | each `{ url, ... }`; healthScore; technical issues; evidence |
| `duplicates` | array | each `{ type, ... }` (e.g. "title"); healthScore; technical issues |
| `orphanPages` | array | WebsiteReport TechnicalDepth + `buildDeepSignals` `[proposal missed this]` |
| `coreWebVitals` | object | pass through from PSI UNCHANGED; the crawler does not compute it |
| `pages` | array | per-page evidence + summary source (see per-page below) |
| `eeatSummary` | object | `{ avgScore, maxScore, signals }` (optional; guarded) |
| `summary` | object | the aggregate counters (see below) |
| `cms` / `cmsPlugin` | string | duplicate-tag cause hint (logic:1533); not populated by v1 either — pre-existing gap |

## `summary` object

`pagesMissingMetaTitle`, `pagesMissingMetaDesc`, `pagesMissingH1`, `pagesMultipleH1`,
`pagesMultipleTitle` `[proposal missed]`, `pagesTitleOutsideHead` `[proposal missed]`,
`pagesMultipleHead` `[proposal missed]`, `pagesMultipleBody` `[proposal missed]`,
`pagesWithMixedContent` `[proposal missed]`, `pagesNoindex`, `pagesNoCanonical`,
`pagesWithSchemaTypes` (array), `schemaTypes` (object frequency map), `totalImgsWithoutAlt`,
`totalImgsMissingAltAttr`, `totalImgsMissingAltText`, `totalImgsWithoutDims`,
`slugIssuesCount`, `thinContentCount`, `avgWordCount`, `socialMissing`, `cwvIssuesCount`,
`commonIssues` (array).

These drive BOTH the technical-issue builders AND the content score (`computeScores`),
so omission shifts numbers on two pillars, not one.

## `pages[]` per-page shape (the evidence layer)

`url`, `statusCode`, `metaTitle`, `metaDesc`, `canonical`, `robotsMeta`, `isNoindex`,
`h1s`, `multipleTitle`, `titleOutsideHead`, `multipleHead`, `multipleBody`,
`httpResourceCount`, `imgsWithoutAlt`, `content` (`{ wordCount, ... }`), `schemas`
(each `{ type, properties: { sameAs, ... } }` — `properties.sameAs` feeds the
AI-readiness entity-identity signal), `eeat`.

- `pages[].eeat` KEY NAMES: the consumer at `report-evidence.js:364` reads
  `eeat.author` / `eeat.byline` / `eeat.hasAuthor`. The v1 producer emits
  `eeat.hasAuthorInfo` — a LATENT MISMATCH, so the author/E-E-A-T signal is always
  off today. The adapter MUST emit `author` / `byline` / `hasAuthor` to light it up.
- If `pages[]` lacks these per-page fields, issues still render but LOSE their exact
  `affected_urls` evidence (stays empty). No throw.

## healthScore formula (reproduce VERBATIM)

Starts at 100, threshold-based deductions (from `website-crawl/route.js` computeHealthScore):

```
score = 100
n = pages.length || 1
pct(k) = round((summary[k] || 0) / n * 100)
if !hasSitemap            score -= 10
if crawlBlockedByRobots   score -= 20
missingTitlePct: >50 -> -15, else >20 -> -8
missingDescPct:  >50 -> -12, else >20 -> -6
missingH1Pct:    >50 -> -10, else >20 -> -5
if pagesWithSchemaTypes.length == 0   score -= 10
if totalImgsWithoutAlt > 10           score -= 8
if duplicates.length > 2              score -= 6
if brokenLinks.length > 0             score -= 5 * min(3, brokenLinks.length)
if pagesNoindex > n/2                 score -= 8
return clamp(round(score), 0, 100)
```

## Guarantees the adapter must uphold

1. Non-null top-level object (Step5Slide2 HOLDS the report only on `!crawlJson`).
2. Every field above present, correct type, never undefined.
3. `coreWebVitals` passed through from PSI untouched.
4. `healthScore` computed by the verbatim formula above.
5. Cap parity: the v1 crawler caps at `MAX_PAGES = 300` (NOT 50). Reproduce 300.
