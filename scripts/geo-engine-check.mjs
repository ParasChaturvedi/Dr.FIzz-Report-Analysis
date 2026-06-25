// scripts/geo-engine-check.mjs — print each GEO engine's adapter status (ready / session_required / …).
// Confirms whether the host can decrypt the Mongo/env login sessions.  node scripts/geo-engine-check.mjs
import { register } from "node:module";
import { readFileSync, existsSync } from "node:fs";
register("./geo-worker-alias-hook.mjs", import.meta.url);
try { if (existsSync(".env.local")) for (const l of readFileSync(".env.local","utf8").split("\n")){const m=l.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);if(m&&process.env[m[1]]===undefined)process.env[m[1]]=m[2].replace(/^["']|["']$/g,"");} } catch {}
const { getEngineAdapters } = await import("../src/lib/seo/geo/engineAdapters.js");
const a = await getEngineAdapters({});
for (const k of Object.keys(a)) console.log(`  ${(a[k].name||k).padEnd(20)} ${a[k].status}${a[k].reason ? `  (${a[k].reason})` : ""}`);
process.exit(0);
