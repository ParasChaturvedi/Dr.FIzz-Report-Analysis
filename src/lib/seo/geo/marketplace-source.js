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
// ─────────────────────────────────────────────────────────────────────────────

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

// MAIN: returns the client's directories[] (drop-in) or null (→ use DataForSEO).
export async function loadMarketplaceDirectories({ domain, businessName = "", location = "" } = {}) {
  if (String(process.env.GEO_MARKETPLACE_SOURCE || "").toLowerCase() !== "llm") return null;
  if (!domain) return null;
  const ttlDays = Number(process.env.GEO_MARKETPLACE_TTL_DAYS || 30);
  try {
    const fs = await import("fs");
    const path = await import("path");
    const file = path.join(cacheDir(), `marketplace-${domainSlug(domain)}.json`);
    if (!fs.existsSync(file)) return null;
    const intel = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!_isUsable(intel, ttlDays)) return null;
    return _toLockedDirectories(intel.client.directories);
  } catch (err) {
    console.warn("[marketplace-source] cache read failed:", err?.message);
    return null; // any error → graceful fallback to DataForSEO
  }
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
