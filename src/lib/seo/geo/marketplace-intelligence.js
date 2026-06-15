// src/lib/seo/geo/marketplace-intelligence.js
// ─────────────────────────────────────────────────────────────────────────────
// MULTI-LLM MARKETPLACE / DIRECTORY INTELLIGENCE  (proprietary synthesis brain)
//
// Replaces the old DataForSEO SERP `site:` directory detection. Instead of one
// search engine, we ask ALL the consumer AI engines (ChatGPT, Gemini, Google AI
// Overviews, Copilot, Perplexity, Claude) where a brand is listed, then we do the
// thinking ourselves:
//
//   1. Prompt generator — the exact brand/competitor template, tuned to force a
//      machine-parseable answer (Platform | URL | confidence).
//   2. Cross-LLM synthesis — for every marketplace, count how many engines affirm
//      a profile, harvest any real profile URL, and SCORE confidence by consensus.
//   3. False-positive elimination — a lone single-engine claim with no URL is
//      treated as a hallucination (listed = false), exactly as the spec demands.
//   4. Optional real-URL verification — if a `verifyUrl` probe is supplied, an
//      extracted profile URL that actually resolves promotes the finding to
//      "verified" (the strongest tier). Pure-logic by default (no network) so the
//      module stays testable without a browser.
//
// This module is COLLECTOR-AGNOSTIC and DEPENDENCY-FREE (pure ESM, no imports) —
// same contract as buildShareOfVoice / buildCitationAnalysis. Input is the raw
// per-engine responses; output is BOTH:
//   • the LOCKED `directories[]` shape the report/dashboard already render
//     ({ name, site, weight, listed, listingUrl, matchedAs }) — a drop-in for
//     checkDirectoryListings() — plus `listedDirectoryCount`, AND
//   • additive `intelligence` (confidence, confirmedBy[], engineCount, verified…)
//     for the richer dashboard view — without touching any locked field.
// ─────────────────────────────────────────────────────────────────────────────

// The directory/marketplace universe. MUST stay aligned with the DIRECTORIES list
// in src/app/api/seo/gmb/route.js so the drop-in output matches 1:1.
export const MARKETPLACES = [
  { name: "JustDial",      site: "justdial.com",    weight: 3 },
  { name: "Sulekha",       site: "sulekha.com",     weight: 3 },
  { name: "IndiaMART",     site: "indiamart.com",   weight: 3 },
  { name: "TradeIndia",    site: "tradeindia.com",  weight: 2 },
  { name: "Google Maps",   site: "google.com/maps", weight: 3 },
  { name: "Yelp",          site: "yelp.com",        weight: 2 },
  { name: "Trustpilot",    site: "trustpilot.com",  weight: 3 },
  { name: "Yellow Pages",  site: "yellowpages.com", weight: 2 },
  { name: "Facebook",      site: "facebook.com",    weight: 2 },
  { name: "Glassdoor",     site: "glassdoor.com",   weight: 1 },
  { name: "Clutch",        site: "clutch.co",       weight: 3 },
  { name: "GoodFirms",     site: "goodfirms.co",    weight: 2 },
  { name: "G2",            site: "g2.com",          weight: 2 },
  { name: "DesignRush",    site: "designrush.com",  weight: 1 },
];

// ── small pure helpers ───────────────────────────────────────────────────────
const _norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
function _host(u) {
  try { return new URL(u).hostname.replace(/^www\./, "").toLowerCase(); }
  catch { return ""; }
}
// the registrable root of a marketplace "site" field ("google.com/maps" → "google.com")
const _siteRoot = (site) => String(site || "").split("/")[0].replace(/^www\./, "").toLowerCase();
// a URL belongs to a marketplace if its host is, or ends with, the site root
function _urlOnSite(url, site) {
  const h = _host(url);
  const root = _siteRoot(site);
  if (!h || !root) return false;
  if (h === root || h.endsWith("." + root)) {
    // google.com/maps must also have /maps in the path to avoid matching plain google.com
    const path = String(site).includes("/") ? String(site).split("/").slice(1).join("/").toLowerCase() : "";
    if (path) { try { return new URL(url).pathname.toLowerCase().includes(path); } catch { return false; } }
    return true;
  }
  return false;
}
function _extractUrls(text) {
  const out = [];
  const re = /https?:\/\/[^\s)>\]"'`]+/gi;
  let m;
  while ((m = re.exec(String(text || ""))) !== null) out.push(m[0].replace(/[.,;)]+$/, ""));
  return out;
}
// Distinctive brand tokens (drop generic words so "Itzfizz Digital" → ["itzfizz"]).
const _GENERIC = new Set(["digital","agency","agencies","solutions","solution","technologies","technology","tech","media","marketing","seo","studio","studios","labs","lab","group","global","services","service","systems","software","online","web","private","limited","ltd","inc","incorporated","llc","llp","the","and","company","co","pvt"]);
function _brandTokens(brand) {
  return _norm(brand).split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !_GENERIC.has(w));
}
// A marketplace URL is credibly THIS brand's profile only if it carries a brand
// token (clutch.co/profile/itzfizz-digital ✓ ; g2.com/sellers/goodfirms ✗ for Itzfizz).
function _urlMatchesBrand(url, brand) {
  const toks = _brandTokens(brand);
  if (!toks.length) return true; // can't tell → don't over-filter
  const u = String(url).toLowerCase().replace(/[^a-z0-9]/g, "");
  return toks.some((t) => u.includes(t));
}

// Does this answer AFFIRM that the brand has a profile on `mpName`?
// We look for the marketplace name and make sure it is NOT inside a negation
// window ("not on Clutch", "no Glassdoor profile", "isn't listed on …").
function _affirmsPresence(text, mpName, mpSite) {
  const t = _norm(text);
  const name = _norm(mpName);
  const rootWord = _siteRoot(mpSite).split(".")[0]; // "clutch", "justdial"
  const needles = [name, rootWord].filter((x) => x && x.length > 2);
  for (const needle of needles) {
    let idx = t.indexOf(needle);
    while (idx !== -1) {
      const before = t.slice(Math.max(0, idx - 28), idx);
      const negated = /\b(no|not|n['’]t|without|absent|missing|lacks?|isn|aren|doesn|don|couldn|unable)\b[^.]*$/.test(before);
      if (!negated) return true;
      idx = t.indexOf(needle, idx + needle.length);
    }
  }
  return false;
}
// Explicit negative ("not listed on Clutch", "no profile on Glassdoor")
function _deniesPresence(text, mpName, mpSite) {
  const t = _norm(text);
  const name = _norm(mpName);
  const rootWord = _siteRoot(mpSite).split(".")[0];
  for (const needle of [name, rootWord].filter((x) => x && x.length > 2)) {
    const re = new RegExp(`\\b(no|not|n['’]t|without|absent|missing|lacks?|isn['’]?t|aren['’]?t|doesn['’]?t|don['’]?t|couldn['’]?t|unable)\\b[^.]{0,40}\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
    if (re.test(t)) return true;
  }
  return false;
}

// ── Prompt generator (the spec's exact template, made parse-friendly) ─────────
// One prompt per brand. Tag carries the brand so the orchestrator can route each
// response back to the right brand during synthesis.
export function buildMarketplacePrompts({ client, clientSite = "", competitors = [], marketplaces = MARKETPLACES } = {}) {
  if (!client) throw new Error("buildMarketplacePrompts: `client` (brand) is required.");
  const names = marketplaces.map((m) => m.name).join(", ");
  const brands = [{ name: client, site: clientSite, role: "client" },
                  ...competitors.map((c) => (typeof c === "string" ? { name: c, site: "", role: "competitor" }
                                                                    : { name: c.name, site: c.site || c.domain || "", role: "competitor" }))]
                  .filter((b) => b.name);

  return brands.map((b, i) => ({
    id: `mp${i + 1}`,
    theme: "Marketplace presence",
    brand: b.name,
    brandRole: b.role,
    prompt:
      `Analyze the brand "${b.name}"${b.site ? ` with official website ${b.site}` : ""}. ` +
      `Identify and verify all of its active profiles across key marketplaces, directories and B2B platforms, ` +
      `including but not limited to: ${names}. ` +
      `Deeply analyze the data from these platforms. Cross-verify the findings, eliminate false positives, ` +
      `and return ONLY the highest-confidence, verifiable data points.\n\n` +
      `Format your answer as one line per platform where a profile genuinely exists, exactly:\n` +
      `Platform | profile URL | confidence (high/medium/low)\n` +
      `If you cannot verify a profile with a real URL, do not list that platform.`,
  }));
}

// ── Per-brand synthesis ───────────────────────────────────────────────────────
// responses: [{ engine, prompt, brand?, answerText?, citations?[] }]
// verifyUrl?: async (url) => ({ ok:boolean, matched?:boolean }) — optional real probe.
async function _synthBrand({ brand, brandSite = "", marketplaces, responses, verifyUrl }) {
  const mine = responses.filter((r) => {
    if (r.brand) return _norm(r.brand) === _norm(brand);
    // fall back to prompt text mentioning the brand (when the collector didn't tag)
    return _norm(r.prompt).includes(_norm(brand));
  });
  const enginesCovered = [...new Set(mine.map((r) => r.engine).filter(Boolean))];
  const totalEngines = enginesCovered.length;

  const directories = [];
  for (const mp of marketplaces) {
    const affirmers = [];        // engines that affirm a profile
    const negators = [];         // engines that explicitly deny one
    const urlByEngine = new Map(); // engine → best URL on this marketplace
    for (const r of mine) {
      const hay = `${r.answerText || ""}\n${(r.citations || []).join("\n")}`;
      const onSite = [..._extractUrls(r.answerText || ""), ...(r.citations || [])].filter((u) => _urlOnSite(u, mp.site));
      // Only a URL that carries the brand token counts as "URL-backed" — a bare
      // domain match (another company's page on the same marketplace) does not.
      const brandUrls = onSite.filter((u) => _urlMatchesBrand(u, brand));
      const nameAffirmed = _affirmsPresence(hay, mp.name, mp.site);
      const denied = onSite.length === 0 && _deniesPresence(hay, mp.name, mp.site);
      if (brandUrls.length) urlByEngine.set(r.engine, brandUrls[0]);
      const affirmed = brandUrls.length > 0 || nameAffirmed;
      if (affirmed && !denied) affirmers.push(r.engine);
      else if (denied) negators.push(r.engine);
    }
    const uniqAffirmers = [...new Set(affirmers)];
    const uniqUrlEngines = [...new Set([...urlByEngine.keys()])];
    const urlCandidates = [...urlByEngine.values()];

    // pick the most-agreed URL (or the first)
    let bestUrl = null;
    if (urlCandidates.length) {
      const tally = new Map();
      for (const u of urlCandidates) tally.set(u, (tally.get(u) || 0) + 1);
      bestUrl = [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0];
    }

    // optional real-URL verification → strongest signal
    let verified = false;
    if (bestUrl && typeof verifyUrl === "function") {
      try { const v = await verifyUrl(bestUrl, brand); verified = !!(v && v.ok && (v.matched !== false)); }
      catch { verified = false; }
    }

    // ── confidence ladder (cross-LLM consensus) ──
    const n = uniqAffirmers.length;
    const majority = Math.max(2, Math.ceil(totalEngines * 0.6));
    let confidence = "none";
    if (verified) confidence = "verified";
    else if (uniqUrlEngines.length >= 1 && n >= 2) confidence = "high";
    else if (n >= majority) confidence = "high";
    else if (n >= 2) confidence = "medium";
    else if (uniqUrlEngines.length >= 1 && n >= 1) confidence = "medium";
    else if (n === 1) confidence = "low"; // lone claim, no URL → likely hallucination

    // ── listed verdict (eliminate false positives) ──
    // true  = verified OR cross-LLM consensus (high/medium)
    // false = engines covered this brand but did not affirm (or explicitly denied)
    // null  = no engine actually covered this brand (scan gap → unknown)
    let listed;
    if (confidence === "verified" || confidence === "high" || confidence === "medium") listed = true;
    else if (totalEngines === 0) listed = null;
    else listed = false; // includes "low" (lone unverifiable claim) and explicit denials

    const entry = {
      // ── LOCKED drop-in shape (do not rename/remove these) ──
      name: mp.name,
      site: mp.site,
      weight: mp.weight,
      listed,
      listingUrl: listed && bestUrl ? bestUrl : null,
      ...(listed ? { matchedAs: brand } : {}),
      // ── additive intelligence (safe extras for the richer dashboard) ──
      confidence,
      confirmedBy: uniqAffirmers,
      engineCount: uniqAffirmers.length,
      totalEngines,
      deniedBy: [...new Set(negators)],
      extractedUrl: bestUrl,
      verified,
    };
    directories.push(entry);
  }

  const listedDirectoryCount = directories.filter((d) => d.listed === true).length;
  const byConfidence = directories.reduce((acc, d) => {
    acc[d.confidence] = (acc[d.confidence] || 0) + 1; return acc;
  }, {});

  return {
    brand,
    brandSite,
    enginesUsed: enginesCovered,
    directories,                 // LOCKED shape (+ additive fields)
    listedDirectoryCount,        // LOCKED count
    totalChecked: marketplaces.length,
    byConfidence,                // { verified, high, medium, low, none }
  };
}

// ── Top-level: dashboard-ready intelligence for client + competitors ──────────
// Returns:
//   {
//     generatedAt,
//     enginesUsed: [...],
//     client:      { brand, directories[], listedDirectoryCount, byConfidence, ... },
//     competitors: [ { brand, directories[], ... }, ... ],
//   }
// The `client.directories` + `client.listedDirectoryCount` are the EXACT drop-in
// for the old checkDirectoryListings() result.
export async function buildMarketplaceIntelligence({
  client,
  clientSite = "",
  competitors = [],
  marketplaces = MARKETPLACES,
  responses = [],
  verifyUrl,
  generatedAt = null,
} = {}) {
  if (!client) throw new Error("buildMarketplaceIntelligence: `client` is required.");
  const compList = competitors.map((c) => (typeof c === "string" ? { name: c, site: "" }
                                                                  : { name: c.name, site: c.site || c.domain || "" }))
                              .filter((c) => c.name);

  const clientOut = await _synthBrand({ brand: client, brandSite: clientSite, marketplaces, responses, verifyUrl });
  const competitorsOut = [];
  for (const c of compList) {
    competitorsOut.push(await _synthBrand({ brand: c.name, brandSite: c.site, marketplaces, responses, verifyUrl }));
  }

  const enginesUsed = [...new Set([
    ...clientOut.enginesUsed,
    ...competitorsOut.flatMap((c) => c.enginesUsed),
  ])];

  return {
    generatedAt,
    source: "multi-llm",
    enginesUsed,
    client: clientOut,
    competitors: competitorsOut,
  };
}

// ── Drop-in helper for gmb/route.js ───────────────────────────────────────────
// Returns ONLY the locked directories[] array for the client (back-compatible with
// the old checkDirectoryListings return value).
export function toDirectoriesArray(intel) {
  const dirs = intel?.client?.directories || [];
  // strip additive fields? NO — downstream ignores unknown keys, and the dashboard
  // wants them. We keep the locked fields first; extras are harmless.
  return dirs;
}
