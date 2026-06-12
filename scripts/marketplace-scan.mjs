// scripts/marketplace-scan.mjs
// ─────────────────────────────────────────────────────────────────────────────
// Runs the MULTI-LLM MARKETPLACE / DIRECTORY scan (the DataForSEO `site:`
// replacement) and writes the cached intelligence artifact the app consumes.
//
// Flow:  runMarketplaceScan (drives every AI engine with the per-brand template)
//        → buildMarketplaceIntelligence (cross-LLM consensus + confidence + real
//          URL verification) → saveMarketplaceIntelligence (.geo-cache/…json).
//
// Then the app uses it automatically by setting in .env.local:
//        GEO_MARKETPLACE_SOURCE=llm
//
// Transport:
//   • local (default)  → reuses the real Chrome profiles from geo-capture.mjs
//                        (.geo-sessions/profile-<engine>). Run geo-capture first.
//   • browserless      → set GEO_TRANSPORT=browserless (hosted; needs sessions).
//
// Per-report inputs here are CALIBRATION ONLY (one example brand from the CLI).
// In production the background job passes brand/domain/competitors straight from
// the user's onboarding input.
//
// Usage:
//   node scripts/marketplace-scan.mjs
//   GEO_BRAND="Itzfizz Digital" GEO_DOMAIN=itzfizz.com \
//     GEO_COMPETITORS="WebFX,Techmagnate" node scripts/marketplace-scan.mjs
// ─────────────────────────────────────────────────────────────────────────────
import fs from "fs";

// Minimal .env.local loader (no dependency)
try {
  const env = fs.readFileSync(".env.local", "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* rely on exported env */ }

const { runMarketplaceScan, makeUrlVerifier } = await import("../src/lib/seo/geo/collector.js");
const { buildMarketplaceIntelligence } = await import("../src/lib/seo/geo/marketplace-intelligence.js");
const { saveMarketplaceIntelligence } = await import("../src/lib/seo/geo/marketplace-source.js");

const brand       = process.env.GEO_BRAND       || "Itzfizz Digital";
const clientDomain= process.env.GEO_DOMAIN      || "itzfizz.com";
const competitors = (process.env.GEO_COMPETITORS || "").split(",").map((s) => s.trim()).filter(Boolean);
const transport   = process.env.GEO_TRANSPORT   || "local";
const mode        = process.env.GEO_MODE        || "live";   // set GEO_MODE=mock to dry-run
const proxyCountry= process.env.GEO_PROXY_COUNTRY || "in";

// Sessions (only needed for the browserless transport)
const sessions = {};
if (transport === "browserless") {
  for (const e of ["chatgpt", "gemini", "copilot", "perplexity", "claude"]) {
    try { sessions[e] = JSON.parse(fs.readFileSync(`.geo-sessions/${e}.json`, "utf8")); } catch {}
  }
}

console.log(`\nMarketplace scan → brand="${brand}" domain=${clientDomain} competitors=[${competitors.join(", ")}]`);
console.log(`mode=${mode} transport=${transport} proxyCountry=${proxyCountry}\n`);

const scan = await runMarketplaceScan({
  mode, transport, client: brand, clientDomain, competitors, proxyCountry, sessions,
});
console.log(`Collected ${scan.responses.length} responses, ${scan.errors.length} errors.`);
if (scan.errors.length) console.log("Errors:\n  " + scan.errors.map((e) => `${e.engine}: ${e.error}`).join("\n  "));

// Real-URL verification promotes URL-backed findings to "verified".
const verifyUrl = makeUrlVerifier({ timeoutMs: 8000 });
const stamp = new Date().toISOString();
const intel = await buildMarketplaceIntelligence({
  client: brand, clientSite: clientDomain, competitors,
  responses: scan.responses, verifyUrl, generatedAt: stamp,
});

const printBrand = (b) => {
  console.log(`\n── ${b.brand}  (${b.listedDirectoryCount}/${b.totalChecked} listed · engines: ${b.enginesUsed.join(", ") || "none"}) ──`);
  b.directories.filter((d) => d.confidence !== "none").forEach((d) =>
    console.log(`   ${d.listed === true ? "✓" : d.listed === false ? "✗" : "?"} ${String(d.name).padEnd(13)} ${String(d.confidence).padEnd(9)} by=[${d.confirmedBy.join(",")}]${d.verified ? " ✔verified" : ""}  ${d.listingUrl || ""}`)
  );
};
printBrand(intel.client);
intel.competitors.forEach(printBrand);

const file = await saveMarketplaceIntelligence(clientDomain, intel);
console.log(`\n✔ Saved intelligence → ${file}`);
console.log(`  Enable in .env.local:  GEO_MARKETPLACE_SOURCE=llm`);
console.log(`  (The gmb route will now use this instead of DataForSEO for ${clientDomain}.)\n`);
process.exit(0);
