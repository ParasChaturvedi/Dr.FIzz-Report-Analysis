// scripts/geo-session-upload.mjs
// ─────────────────────────────────────────────────────────────────────────────
// Upload locally-captured login sessions (.geo-sessions/<engine>.json) into MongoDB,
// ENCRYPTED at rest (AES-256-GCM via TOKEN_ENCRYPTION_KEY). This is what the Vercel app
// reads (availableLoginEngines) so the report's per-engine badge shows "Ready" instead of
// "Session Required", and it's the portable fallback the worker can pull when it has no
// local profile/file. Prints counts + status only — never the cookie contents.
//
//   node scripts/geo-session-upload.mjs            # chatgpt, gemini, copilot
//   node scripts/geo-session-upload.mjs chatgpt    # one engine
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
if (!process.env.MONGODB_URI) { console.error("MONGODB_URI not set"); process.exit(1); }
if (!process.env.TOKEN_ENCRYPTION_KEY) { console.error("REFUSING: TOKEN_ENCRYPTION_KEY not set — would store cookies in plaintext."); process.exit(1); }

const list = process.argv.slice(2).map((s) => s.toLowerCase()).filter(Boolean);
const engines = list.length ? list : ["chatgpt", "gemini", "copilot"];
const { saveGeoSession } = await import("../src/lib/seo/geo/sessions.js");

for (const e of engines) {
  const f = `.geo-sessions/${e}.json`;
  if (!existsSync(f)) { console.log(`${e}: no file ${f} — skip`); continue; }
  try {
    const state = JSON.parse(readFileSync(f, "utf8"));
    await saveGeoSession(e, state);
    console.log(`${e}: uploaded to Mongo (encrypted) — ${(state.cookies || []).length} cookies`);
  } catch (err) { console.log(`${e}: FAILED — ${String(err?.message || err).slice(0, 140)}`); }
}
process.exit(0);
