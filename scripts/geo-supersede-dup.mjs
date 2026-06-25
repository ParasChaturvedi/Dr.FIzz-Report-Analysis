// scripts/geo-supersede-dup.mjs
// ─────────────────────────────────────────────────────────────────────────────
// Supersede DUPLICATE queued runs that were created AFTER the run currently being
// collected. The report follows getLatestRun (newest by created_at), so a stray queued
// run masks the active one — its data won't show until the duplicate also runs. This marks
// such duplicates terminal (status partial, stopped_by_user) and back-dates them so the
// ACTIVE run becomes the latest and its measured data surfaces as soon as it completes.
// Safe: only touches QUEUED runs strictly newer than an in-progress run.
//   node scripts/geo-supersede-dup.mjs itzfizz.com
// ─────────────────────────────────────────────────────────────────────────────
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
const { listRuns, updateGeoRun, getGeoProjectByDomain } = await import("../src/lib/seo/geo/model/geoStore.js");
const proj = await getGeoProjectByDomain(domain);
if (!proj) { console.log("no geo project for", domain); process.exit(0); }
const runs = await listRuns(proj.project_id, 12); // newest first
const ACTIVE = ["running", "collecting", "parsing", "scoring"];
const active = runs.find((r) => ACTIVE.includes(r.status));
if (!active) { console.log("no in-progress run — nothing to supersede"); process.exit(0); }
const activeTs = new Date(active.created_at).getTime();
let n = 0;
for (const r of runs) {
  if (r.status === "queued" && new Date(r.created_at).getTime() > activeTs) {
    await updateGeoRun(r.run_id, { status: "partial", stopped_by_user: true, completed_at: new Date(), created_at: new Date(activeTs - 60000) });
    console.log(`superseded duplicate queued run ${r.run_id}`);
    n++;
  }
}
console.log(`active run ${active.run_id} (${active.status}) is now the latest; superseded ${n} duplicate(s).`);
process.exit(0);
