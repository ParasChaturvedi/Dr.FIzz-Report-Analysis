// scripts/geo-force-run.mjs
// ─────────────────────────────────────────────────────────────────────────────
// Force a FRESH GEO collection for a domain, bypassing the 30-day /ensure cache guard.
// Generates token-free template prompts (useClaude:false), auto-approves them, and queues
// a run. The dedicated VPS worker (polling MongoDB) then claims + collects it with the
// captured login sessions. Run locally — it only writes the queued run to Mongo.
//
//   node scripts/geo-force-run.mjs itzfizz.com
// ─────────────────────────────────────────────────────────────────────────────
import { register } from "node:module";
import { readFileSync, existsSync } from "node:fs";

register("./geo-worker-alias-hook.mjs", import.meta.url);

try {
  if (existsSync(".env.local")) {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
} catch {}
if (!process.env.MONGODB_URI) { console.error("MONGODB_URI not set"); process.exit(1); }

const cleanDomain = (s) => String(s || "").replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").toLowerCase();
const domain = cleanDomain(process.argv[2] || "itzfizz.com");

const { generateGeoPromptsForProject } = await import("../src/lib/seo/geo/promptService.js");
const { getGeoProjectByDomain, setPromptsStatus, updateGeoRun } = await import("../src/lib/seo/geo/model/geoStore.js");

const project = await getGeoProjectByDomain(domain);
const gen = await generateGeoPromptsForProject({
  projectId: project?.project_id,
  source: { domain },
  runMode: process.env.GEO_RUN_MODE || "standard",
  geoPlanMode: "quick",
  useClaude: false,
  regenerate: true,
});
if (!gen.ok) { console.error("prompt generation failed:", gen.error); process.exit(1); }
await setPromptsStatus(gen.project_id, [], "approved");
await updateGeoRun(gen.run_id, { status: "queued", queued_at: new Date().toISOString(), approved_prompt_count: gen.generated, stopped_by_user: false });
console.log(`✔ Queued fresh GEO run ${gen.run_id} for ${domain} — ${gen.generated} prompts · engines: ${(gen.selected_engines || []).join(", ")}`);
process.exit(0);
