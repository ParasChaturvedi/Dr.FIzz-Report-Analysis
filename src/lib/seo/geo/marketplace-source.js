// src/lib/seo/geo/marketplace-source.js
// ─────────────────────────────────────────────────────────────────────────────
// MARKETPLACE SOURCE SWITCH  (drop-in for checkDirectoryListings)
//
// Lets the gmb route prefer the multi-LLM Marketplace Intelligence over the old
// DataForSEO SERP `site:` detection — WITHOUT changing the output shape and
// WITHOUT risking existing reports:
//
//   • Default (flag off / no cache) → returns null → caller uses DataForSEO.
//   • Flag on + a fresh cached scan exists → returns the LOCKED directories[]
//     array (drop-in), already cross-LLM-validated and confidence-scored.
//
// The live multi-LLM scan is far too heavy to run inline in this serverless route
// (90s cap, called once per competitor). So it runs as a background/offline
// PRODUCER (scripts/marketplace-scan.mjs → writes the cache artifact) and this
// module is the CONSUMER. Cache is keyed by domain host.
//
// Enable with:  GEO_MARKETPLACE_SOURCE=llm   (anything else = DataForSEO, unchanged)
// Optional:     GEO_MARKETPLACE_TTL_DAYS=30  (max cache age before ignoring it)
//               GEO_MARKETPLACE_CACHE_DIR=.geo-cache
//
// SERVERLESS NOTE (Vercel): the local `.geo-cache` filesystem does NOT persist, so
// on production we read/write the intelligence from MongoDB (`data_type:geo-marketplace`,
// the same 30-day store as every other cached fetch). The local `.geo-cache` is kept
// as a secondary read source for local dev / a VPS producer.
// ─────────────────────────────────────────────────────────────────────────────

import { getCached, putCached } from "../../cache/mongo.js";

// MongoDB data_type for the cached marketplace intelligence.
const GEO_DATA_TYPE = "geo-marketplace";

const LOCKED_FIELDS = ["name", "site", "weight", "listed", "listingUrl"];

export function domainSlug(domain) {
  return String(domain || "")
    .replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]
    .toLowerCase().replace(/[^a-z0-9.-]/g, "_");
}

function cacheDir() {
  return process.env.GEO_MARKETPLACE_CACHE_DIR || ".geo-cache";
}

// Validate that an object looks like our intelligence artifact and is fresh.
function _isUsable(intel, ttlDays) {
  if (!intel || !intel.client || !Array.isArray(intel.client.directories)) return false;
  const dirs = intel.client.directories;
  if (!dirs.length || !LOCKED_FIELDS.every((f) => f in dirs[0])) return false;
  if (ttlDays > 0 && intel.generatedAt) {
    const age = (Date.parse(String(intel.generatedAt)) || 0);
    if (age) {
      const days = (Date.now() - age) / (1000 * 60 * 60 * 24);
      if (days > ttlDays) return false; // stale → fall back
    }
  }
  return true;
}

// Strip additive intelligence fields → return EXACTLY the locked drop-in shape,
// so downstream consumers behave identically to the old DataForSEO result.
function _toLockedDirectories(dirs) {
  return dirs.map((d) => {
    const out = { name: d.name, site: d.site, weight: d.weight, listed: d.listed, listingUrl: d.listingUrl ?? null };
    if (d.listed === true && d.matchedAs) out.matchedAs = d.matchedAs;
    // keep the richer signals too — consumers ignore unknown keys, the dashboard uses them
    if (d.confidence) out.confidence = d.confidence;
    if (Array.isArray(d.confirmedBy)) out.confirmedBy = d.confirmedBy;
    if (typeof d.verified === "boolean") out.verified = d.verified;
    return out;
  });
}

// Read cached intelligence: MongoDB first (persists on serverless), then the local
// .geo-cache file (local dev / VPS producer). Returns a usable intel object or null.
async function _readIntel(domain, ttlDays) {
  // 1) MongoDB — the production store.
  try {
    const m = await getCached({ domain, dataType: GEO_DATA_TYPE, ttlDays });
    if (m && _isUsable(m, ttlDays)) return m;
  } catch (err) { console.warn("[marketplace-source] mongo read failed:", err?.message); }
  // 2) Local .geo-cache (won't exist on Vercel, but used in dev / on a VPS).
  try {
    const fs = await import("fs");
    const path = await import("path");
    const file = path.join(cacheDir(), `marketplace-${domainSlug(domain)}.json`);
    if (fs.existsSync(file)) {
      const intel = JSON.parse(fs.readFileSync(file, "utf8"));
      if (_isUsable(intel, ttlDays)) return intel;
    }
  } catch (err) { console.warn("[marketplace-source] file read failed:", err?.message); }
  return null;
}

// Run the live multi-LLM scan INLINE, store the result to MongoDB (+ best-effort
// local file), and return the intelligence. null on any failure → DataForSEO fallback.
// Engine default = the ones that work WITHOUT captured login sessions (serverless has
// no .geo-sessions): Google AI Overviews + Perplexity (browser, no login) + Claude (API).
// Add chatgpt,gemini via GEO_INLINE_ENGINES once their sessions are available server-side.
async function _runAndStoreScan({ domain, businessName, competitors = [], proxyCountry = "in" }) {
  try {
    const { runMarketplaceScan, makeUrlVerifier } = await import("./collector.js");
    const { buildMarketplaceIntelligence } = await import("./marketplace-intelligence.js");
    const engineKeys = String(process.env.GEO_INLINE_ENGINES || "aioverviews,perplexity,claude")
      .split(",").map((s) => s.trim()).filter(Boolean);
    const brand = businessName || domainSlug(domain).split(".")[0];
    console.log(`[marketplace-source] no fresh cache for ${domain} → running inline scan (engines: ${engineKeys.join(",")})`);
    const scan = await runMarketplaceScan({
      mode: "live", transport: "browserless",
      client: brand, clientDomain: domain, competitors, proxyCountry, engineKeys, sessions: {},
    });
    if (!scan?.responses?.length) return null;
    const verifyUrl = makeUrlVerifier({ timeoutMs: 8000 });
    const intel = await buildMarketplaceIntelligence({
      client: brand, clientSite: domain, competitors,
      responses: scan.responses, verifyUrl, generatedAt: new Date().toISOString(),
    });
    if (!_isUsable(intel, 0)) return null;
    await putCached({ domain, dataType: GEO_DATA_TYPE, payload: intel, source: "llm-scan", fetchedBy: brand });
    try { await saveMarketplaceIntelligence(domain, intel); } catch { /* RO FS on serverless — ignore */ }
    return intel;
  } catch (err) {
    console.warn("[marketplace-source] inline scan failed (fallback to DataForSEO):", err?.message);
    return null;
  }
}

// MAIN: returns the client's directories[] (drop-in) or null (→ use DataForSEO).
// allowLiveScan=true (the client's gmb call) runs the scan inline on a cache miss;
// other callers read-only so the scan never runs twice per report.
export async function loadMarketplaceDirectories({ domain, businessName = "", location = "", competitors = [], allowLiveScan = false, proxyCountry = "in" } = {}) {
  if (String(process.env.GEO_MARKETPLACE_SOURCE || "").trim().toLowerCase() !== "llm") return null;
  if (!domain) return null;
  const ttlDays = Number(process.env.GEO_MARKETPLACE_TTL_DAYS || 30);
  let intel = await _readIntel(domain, ttlDays);
  if (!intel && allowLiveScan) intel = await _runAndStoreScan({ domain, businessName, competitors, proxyCountry });
  if (!intel || !Array.isArray(intel?.client?.directories)) return null;
  return _toLockedDirectories(intel.client.directories);
}

// LLM-scan BACKLINKS for the client (reference sites the LLMs cited) — the owner's
// chosen backlink source. Returns { count, sites:[{domain,backlinks,...}] } or null
// (→ keep Moz/DataForSEO backlinks). Gated on the same GEO_MARKETPLACE_SOURCE flag.
export async function loadLlmBacklinks({ domain } = {}) {
  if (String(process.env.GEO_MARKETPLACE_SOURCE || "").trim().toLowerCase() !== "llm") return null;
  if (!domain) return null;
  const ttlDays = Number(process.env.GEO_MARKETPLACE_TTL_DAYS || 30);
  // Read-only (Mongo → local). The scan is triggered by loadMarketplaceDirectories,
  // so this just consumes whatever it already stored — never runs a second scan.
  const intel = await _readIntel(domain, ttlDays);
  const bl = intel?.client?.backlinks;
  if (!bl || typeof bl.count !== "number") return null;
  return { count: bl.count, sites: Array.isArray(bl.sites) ? bl.sites : [] };
}

// Writer used by the offline producer (scripts/marketplace-scan.mjs).
export async function saveMarketplaceIntelligence(domain, intel) {
  const fs = await import("fs");
  const path = await import("path");
  fs.mkdirSync(cacheDir(), { recursive: true });
  const file = path.join(cacheDir(), `marketplace-${domainSlug(domain)}.json`);
  fs.writeFileSync(file, JSON.stringify(intel, null, 2));
  return file;
}
