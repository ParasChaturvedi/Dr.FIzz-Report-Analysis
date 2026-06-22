// scripts/geo-worker.mjs
// ─────────────────────────────────────────────────────────────────────────────
// DEDICATED GEO WORKER — runs on a worker host (VPS), NOT Vercel. Polls MongoDB for
// "queued" GEO runs, executes them through the existing Playwright/Browserless
// collector, parses + scores the REAL answers, and writes everything back to MongoDB.
//
//   node scripts/geo-worker.mjs                 # loop, auto transport (browserless)
//   node scripts/geo-worker.mjs --local         # loop, local captured Chrome profiles
//   node scripts/geo-worker.mjs --browserless   # loop, hosted Browserless
//   node scripts/geo-worker.mjs --once          # claim + run a single job, then exit
//   node scripts/geo-worker.mjs --mock --once   # exercise the full pipeline, no browser
//
// Reads MONGODB_URI / BROWSERLESS_TOKEN / ANTHROPIC_API_KEY from .env.local (or the
// host env). Login engines (chatgpt/gemini/copilot) need captured sessions; without
// them they error "session required" — the worker NEVER fabricates an answer.
// ─────────────────────────────────────────────────────────────────────────────
import { register } from "node:module";
import { readFileSync, existsSync } from "node:fs";

// 1) make the "@/..." alias resolvable (Next maps it to ./src/...).
register("./geo-worker-alias-hook.mjs", import.meta.url);

// 2) load .env.local into process.env (no dotenv dependency).
try {
  if (existsSync(".env.local")) {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
} catch {}

const args = new Set(process.argv.slice(2));
const transport = args.has("--local") ? "local" : (args.has("--browserless") ? "browserless" : undefined);
const mode = args.has("--mock") ? "mock" : "live";
const once = args.has("--once");

if (!process.env.MONGODB_URI) { console.error("[geo-worker] MONGODB_URI is not set — cannot claim jobs."); process.exit(1); }
if (mode === "live" && !transport && !process.env.BROWSERLESS_TOKEN) {
  console.warn("[geo-worker] no BROWSERLESS_TOKEN — pass --local for captured Chrome profiles, or --mock to test the pipeline.");
}

const { runWorkerLoop } = await import("../src/lib/seo/geo/worker.js");
console.log(`[geo-worker] starting · transport=${transport || "auto/browserless"} · mode=${mode} · ${once ? "single job" : "loop"}`);
await runWorkerLoop({ transport, mode, once });
if (once) { console.log("[geo-worker] done."); process.exit(0); }
