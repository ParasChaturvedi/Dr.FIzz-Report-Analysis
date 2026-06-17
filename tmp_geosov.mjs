import { readFileSync } from "fs";
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const t = line.trim(); if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("="); if (eq < 0) continue;
  const k = t.slice(0, eq).trim(); const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  if (k && !process.env[k]) process.env[k] = v;
}
process.env.GEO_MARKETPLACE_SOURCE = "llm";
const { runGeoScan } = await import("./src/lib/seo/geo/collector.js");
const { buildShareOfVoice, buildCitationAnalysis } = await import("./src/lib/seo/doctor-fizz-logic.js");

console.log("Running GEO scan (aioverviews + claude) for itzfizz.com…");
const scan = await runGeoScan({
  mode: "live", transport: "browserless",
  brand: "Itzfizz Digital", clientDomain: "itzfizz.com",
  competitors: ["WebChutney", "Schbang"], competitorDomains: ["webchutney.com", "schbang.com"],
  industry: "digital marketing agency", location: "India",
  engineKeys: ["aioverviews", "claude"], proxyCountry: "in", sessions: {},
});
console.log(`responses: ${scan.responses.length}, errors: ${scan.errors.length}`);
for (const r of scan.responses) console.log(`  [${r.engine}] "${(r.prompt || "").slice(0, 42)}" → brands: ${(r.brandsMentioned || []).join(", ") || "none"} | citations: ${(r.citations || []).length}`);
for (const e of scan.errors) console.log(`  ❌ [${e.engine}] ${e.error}`);

const sov = buildShareOfVoice({ brandSet: scan.brandSet, client: "Itzfizz Digital", responses: scan.responses });
const cites = buildCitationAnalysis({ clientDomain: "itzfizz.com", clientName: "Itzfizz Digital", competitorDomains: ["webchutney.com", "schbang.com"], responses: scan.responses });
console.log("\n=== SHARE OF VOICE ===");
console.log(sov ? JSON.stringify(sov, null, 1).slice(0, 900) : "null");
console.log("\n=== CITATIONS (top) ===");
console.log(cites ? JSON.stringify(cites?.most_cited_domains?.slice(0, 5) || cites, null, 1).slice(0, 500) : "null");
process.exit(0);
