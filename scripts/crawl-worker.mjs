// scripts/crawl-worker.mjs
// ─────────────────────────────────────────────────────────────────────────────
// DEDICATED CRAWL WORKER — runs on the VPS (NOT Vercel), alongside the GEO worker.
// Polls MongoDB for queued crawl jobs and runs the FULL rendered (Browserless) crawl
// with no 300s cap, writing the result into the crawl cache the report reads.
//
//   node scripts/crawl-worker.mjs           # loop
//   node scripts/crawl-worker.mjs --once     # claim + run one job, then exit
//
// Reads MONGODB_URI / BROWSERLESS_TOKEN from .env.local (or host env). Reuses the exact
// crawlDomain() from the Vercel route, so there is no second crawler to keep in sync.
// ─────────────────────────────────────────────────────────────────────────────
import { register } from "node:module";
import { readFileSync, existsSync } from "node:fs";

// 1) make the "@/..." alias + extensionless imports resolvable (same hook the GEO worker uses).
register("./geo-worker-alias-hook.mjs", import.meta.url);

// 2) load .env.local into process.env (no dotenv dependency).
try {
  if (existsSync(".env.local")) {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
} catch { /* host env is fine too */ }

const args = new Set(process.argv.slice(2));
const once = args.has("--once");

if (!process.env.MONGODB_URI) { console.error("[crawl-worker] MONGODB_URI not set — cannot claim jobs."); process.exit(1); }
if (!process.env.BROWSERLESS_TOKEN) { console.warn("[crawl-worker] no BROWSERLESS_TOKEN — the crawl will fall back to raw HTML (no rendering)."); }

const { runCrawlWorkerLoop } = await import("../src/lib/seo/crawl/crawlWorker.js");
await runCrawlWorkerLoop({ once });
if (once) { console.log("[crawl-worker] done."); process.exit(0); }
