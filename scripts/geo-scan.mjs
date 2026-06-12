// scripts/geo-scan.mjs
// ─────────────────────────────────────────────────────────────────────────────
// Runs a LIVE GEO scan: Playwright → Browserless drives each AI engine using the
// captured sessions, then feeds the raw responses into the proprietary
// SoV + Citation logic and prints the result. Use this to calibrate, then we
// wire the same runGeoScan() into a background job for the app.
//
// PLATFORM SECRETS (static — same for every report; in .env.local, never public):
//   BROWSERLESS_TOKEN=...                 (your Browserless API token)
//   BROWSERLESS_USE_RESIDENTIAL=1         (in-country residential proxy)
//   BROWSERLESS_ENDPOINT_BASE=https://production-sfo.browserless.io   (optional)
//   ANTHROPIC_API_KEY=...                 (for Claude via API)
//
// PER-REPORT INPUTS (GEO_BRAND / GEO_DOMAIN / GEO_INDUSTRY / GEO_COMPETITORS /
//   GEO_LOCATION) are used HERE FOR CALIBRATION ONLY — to test one example brand
//   from the CLI without the UI. In the live product these are NOT env vars: the
//   background job passes the brand/domain/industry/competitors/location straight
//   from the user's onboarding input (the same businessData / domain /
//   competitorData / location the rest of the pipeline already uses), so every
//   report scans its own company automatically.
//
// Usage:  node scripts/geo-scan.mjs
// ─────────────────────────────────────────────────────────────────────────────
import fs from "fs";

// Minimal .env.local loader (no dependency)
try {
  const env = fs.readFileSync(".env.local", "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* no .env.local — rely on exported env */ }

const { runGeoScan } = await import("../src/lib/seo/geo/collector.js");
const { buildShareOfVoice, buildCitationAnalysis } = await import("../src/lib/seo/doctor-fizz-logic.js");

const loadSession = (e) => { try { return JSON.parse(fs.readFileSync(`.geo-sessions/${e}.json`, "utf8")); } catch { return null; } };
const sessions = {};
for (const e of ["chatgpt", "gemini", "copilot", "perplexity", "claude"]) {
  const s = loadSession(e);
  if (s) sessions[e] = s;
}
const engineKeys = Object.keys(sessions);
if (!engineKeys.length) {
  console.error("No sessions found in .geo-sessions/. Capture at least one first:\n  node scripts/geo-capture.mjs chatgpt\n");
  process.exit(1);
}
console.log("Engines with sessions:", engineKeys.join(", "));

const scan = await runGeoScan({
  mode: "live",
  brand:        process.env.GEO_BRAND      || "Itzfizz Digital",
  clientDomain: process.env.GEO_DOMAIN     || "itzfizz.com",
  industry:     process.env.GEO_INDUSTRY   || "SEO agency",
  location:     process.env.GEO_LOCATION   || "",
  proxyCountry: process.env.GEO_PROXY_COUNTRY || "in",
  competitors:  (process.env.GEO_COMPETITORS || "").split(",").map(s => s.trim()).filter(Boolean),
  marketplaces: ["Clutch", "GoodFirms", "G2", "Sulekha", "TradeIndia"],
  engineKeys,
  sessions,
});

console.log(`\nCollected ${scan.responses.length} responses, ${scan.errors.length} errors.`);
if (scan.errors.length) console.log("Errors:", scan.errors.map(e => `${e.engine}: ${e.error}`).join("\n        "));
fs.mkdirSync(".geo-sessions", { recursive: true });
fs.writeFileSync(".geo-sessions/last-scan.json", JSON.stringify(scan, null, 2));
console.log("Raw scan saved → .geo-sessions/last-scan.json  (inspect to calibrate selectors)");

const sov = buildShareOfVoice({ brandSet: scan.brandSet, client: scan.client, responses: scan.responses });
const cit = buildCitationAnalysis({ clientDomain: scan.clientDomain, clientName: scan.client, competitorDomains: scan.competitorDomains, responses: scan.responses });
console.log("\n── SHARE OF VOICE ──");
(sov?.by_brand || []).forEach(b => console.log(`  ${b.is_client ? "*" : " "} ${b.brand}: avg ${b.avg}%`));
console.log("\n── CITATION GAP ──\n ", cit?.citation_gap || "(no citations captured)");
process.exit(0);
