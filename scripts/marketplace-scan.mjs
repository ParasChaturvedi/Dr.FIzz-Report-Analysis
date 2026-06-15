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
//   • browserless (DEFAULT) → HEADLESS browser hosted in Browserless's cloud.
//                        Nothing opens on your device; fully automatic. Each query
//                        runs in a fresh throwaway context (incognito) and ChatGPT
//                        uses Temporary Chat → no history / no memory bias. Uses the
//                        captured storageState sessions (.geo-sessions/<engine>.json)
//                        only to authenticate; logged-out engines stay logged out.
//   • local            → set GEO_TRANSPORT=local to drive real local Chrome profiles
//                        (visible windows; for debugging/calibration only).
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
    // load when the env var is undefined OR empty (an empty shell var must not block .env.local)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* rely on exported env */ }

const { runMarketplaceScan, makeUrlVerifier } = await import("../src/lib/seo/geo/collector.js");
const { buildMarketplaceIntelligence } = await import("../src/lib/seo/geo/marketplace-intelligence.js");
const { saveMarketplaceIntelligence } = await import("../src/lib/seo/geo/marketplace-source.js");

const brand       = process.env.GEO_BRAND       || "Itzfizz Digital";
const clientDomain= process.env.GEO_DOMAIN      || "itzfizz.com";
const competitors = (process.env.GEO_COMPETITORS || "").split(",").map((s) => s.trim()).filter(Boolean);
const transport   = process.env.GEO_TRANSPORT   || "browserless";  // headless cloud — no device windows
const mode        = process.env.GEO_MODE        || "live";   // set GEO_MODE=mock to dry-run
const proxyCountry= process.env.GEO_PROXY_COUNTRY || "in";

// Sessions authenticate the logged-in engines (Browserless seeds a fresh ephemeral
// context with these cookies per query, then discards it → incognito, no memory).
const sessions = {};
if (transport === "browserless") {
  for (const e of ["chatgpt", "gemini", "copilot", "perplexity", "claude"]) {
    try { sessions[e] = JSON.parse(fs.readFileSync(`.geo-sessions/${e}.json`, "utf8")); } catch {}
  }
}

console.log(`\nMarketplace scan → brand="${brand}" domain=${clientDomain} competitors=[${competitors.join(", ")}]`);
console.log(`mode=${mode} transport=${transport} proxyCountry=${proxyCountry}\n`);

// Skip a re-scan if a fresh cache already exists → saves Browserless units.
// Force a re-scan with GEO_FORCE=1.
if (mode === "live" && String(process.env.GEO_FORCE || "") !== "1") {
  const ttlDays = Number(process.env.GEO_MARKETPLACE_TTL_DAYS || 30);
  const slug = clientDomain.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].toLowerCase().replace(/[^a-z0-9.-]/g, "_");
  try {
    const existing = JSON.parse(fs.readFileSync(`.geo-cache/marketplace-${slug}.json`, "utf8"));
    const ageDays = (Date.now() - (Date.parse(existing.generatedAt) || 0)) / 86400000;
    if (existing.generatedAt && ageDays < ttlDays) {
      console.log(`✔ Fresh cache exists (${ageDays.toFixed(1)}d old < ${ttlDays}d TTL) → skipping scan to save Browserless units.`);
      console.log(`  Re-scan anyway with:  GEO_FORCE=1 node scripts/marketplace-scan.mjs\n`);
      process.exit(0);
    }
  } catch { /* no usable cache → run the scan */ }
}

const engineKeys = (process.env.GEO_ENGINES || "").split(",").map((s) => s.trim()).filter(Boolean);
const scan = await runMarketplaceScan({
  mode, transport, client: brand, clientDomain, competitors, proxyCountry, sessions,
  ...(engineKeys.length ? { engineKeys } : {}),
});
console.log(`Collected ${scan.responses.length} responses, ${scan.errors.length} errors.`);
if (scan.errors.length) console.log("Errors:\n  " + scan.errors.map((e) => `${e.engine}: ${e.error}`).join("\n  "));
// Persist the RAW scan so we can calibrate per-engine selectors from real output.
try { fs.mkdirSync(".geo-cache", { recursive: true }); fs.writeFileSync(".geo-cache/last-marketplace-scan.json", JSON.stringify(scan, null, 2)); console.log("Raw scan → .geo-cache/last-marketplace-scan.json"); } catch {}
// Browserless cost visibility — Claude is API (no Browserless units).
const browserQueries = [...scan.responses, ...scan.errors].filter((r) => r.engine !== "Claude").length;
console.log(`Browserless sessions this scan: ~${browserQueries} (Claude via API = 0 Browserless units; images/fonts blocked to cut residential bandwidth).`);

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
