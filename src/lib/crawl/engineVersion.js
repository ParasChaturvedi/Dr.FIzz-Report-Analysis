// src/lib/crawl/engineVersion.js
// ─────────────────────────────────────────────────────────────────────────────
// The single source of truth for "which crawl engine produced this data".
//
// WHY this exists: the report cache key (src/lib/cache/report-key.js) and the raw
// crawl cache are keyed by business inputs only, with NO engine version. So if the
// crawl engine changes but the inputs do not, a client keeps getting the OLD crawl
// data from the 30-day cache and the new engine silently never ships. Folding this
// constant into the cache key fixes that: bump it, and the cache busts on deploy.
//
// WHY a hand-bumped constant and not an auto hash of the crawler source: an auto
// bump on every deploy would throw away the cache for cosmetic edits (a comment, a
// log line) and re-crawl every site for nothing. This must be bumped deliberately,
// and only when the crawl OUTPUT SEMANTICS change: a new audit threshold, a new
// rendering pass, a scoring tweak. Review the bump like any other behaviour change.
//
// HISTORY (bump the date suffix whenever the crawl OUTPUT changes):
//   v1-legacy         the original raw-HTML crawler
//   v2-2026-07-10     + 8 accuracy fixes (errored-page filter, @graph schema, reversed
//                     og/twitter, length caps, author E-E-A-T, CMS detect, robots
//                     false-positive) AND the opt-in Browserless rendered crawl
//                     (CRAWLER_ENGINE=v2). Bumped so the 30-day report cache busts and
//                     clients get the more-accurate crawl instead of stale pre-fix data.
//   v2-2026-07-11     structural checks (multiple <head>/<body>/<title>) now counted from
//                     the DOCUMENT STRUCTURE, not raw bytes. Page-builder HTML widgets embed
//                     <!DOCTYPE html>…<head>…<body> boilerplate as BODY content; a browser
//                     discards the nested head/body, so the old regex falsely flagged nearly
//                     every page. Verified vs parse5: raw regex 3/3/3, real DOM 1/1/1. Bumped
//                     so those false-positive technical findings clear from cached reports.
// ─────────────────────────────────────────────────────────────────────────────
export const CRAWL_ENGINE_VERSION = "v2-2026-07-11";
export default CRAWL_ENGINE_VERSION;
