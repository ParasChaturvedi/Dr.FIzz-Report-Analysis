// scripts/geo-run-status.mjs — read-only live progress of the latest GEO run for a domain.
//   node scripts/geo-run-status.mjs itzfizz.com
import { register } from "node:module";
import { readFileSync, existsSync } from "node:fs";
register("./geo-worker-alias-hook.mjs", import.meta.url);
try {
  if (existsSync(".env.local")) for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}
const domain = String(process.argv[2] || "itzfizz.com").replace(/^https?:\/\//, "").replace(/^www\./, "").toLowerCase();
const { getGeoProjectByDomain, getGeoReportBundle } = await import("../src/lib/seo/geo/model/geoStore.js");
const proj = await getGeoProjectByDomain(domain);
if (!proj) { console.log("no geo project for", domain); process.exit(0); }
const bundle = await getGeoReportBundle(proj.project_id);
const run = bundle.run || {};
const results = bundle.results || [];
const byEngine = {};
for (const r of results) {
  const e = r.engine || "?";
  (byEngine[e] ||= { saved: 0, brand: 0, cites: 0 });
  byEngine[e].saved++; if (r.brand_mentioned) byEngine[e].brand++; byEngine[e].cites += (r.citation_count || 0);
}
console.log(`run ${run.run_id} · status=${run.status} · saved=${results.length}/${run.prompt_count ?? "?"} · failed=${run.failed_count ?? "?"} · blocked=${(run.blocked_engines || []).join(",") || "none"}`);
for (const [e, v] of Object.entries(byEngine).sort()) console.log(`  ${e.padEnd(12)} saved=${v.saved}  brand-mentions=${v.brand}  citations=${v.cites}`);
process.exit(0);
