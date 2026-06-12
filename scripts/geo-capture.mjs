// scripts/geo-capture.mjs
// ─────────────────────────────────────────────────────────────────────────────
// ONE-TIME session capture for the live GEO scan.
// Opens a real browser window → YOU log in (handle OTP/2FA) → it saves the
// logged-in session (cookies + localStorage) to .geo-sessions/<engine>.json.
// The live scan reuses that session so it never has to log in again.
//
// Local setup (one time):
//   npm i -D playwright
//   npx playwright install chromium
//
// Usage:
//   node scripts/geo-capture.mjs chatgpt
//   node scripts/geo-capture.mjs gemini
//   node scripts/geo-capture.mjs copilot
//   node scripts/geo-capture.mjs perplexity
//   (Claude does NOT need this — we use the Anthropic API for Claude.)
// ─────────────────────────────────────────────────────────────────────────────
import fs from "fs";
import path from "path";

const ENGINES = {
  chatgpt:    "https://chatgpt.com/",
  gemini:     "https://gemini.google.com/app",
  copilot:    "https://copilot.microsoft.com/",
  perplexity: "https://www.perplexity.ai/",
  claude:     "https://claude.ai/new",
};

const engine = (process.argv[2] || "").toLowerCase();
if (!ENGINES[engine]) {
  console.error("Usage: node scripts/geo-capture.mjs <chatgpt|gemini|copilot|perplexity|claude>");
  process.exit(1);
}

let chromium;
try { ({ chromium } = await import("playwright")); }
catch {
  console.error("\nPlaywright (full) is not installed locally. Run:\n  npm i -D playwright && npx playwright install chromium\n");
  process.exit(1);
}

const dir = ".geo-sessions";
fs.mkdirSync(dir, { recursive: true });
const out = path.join(dir, `${engine}.json`);

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ locale: "en-US" });
const page = await context.newPage();
await page.goto(ENGINES[engine], { waitUntil: "domcontentloaded" });

console.log(`\n👉 Log into ${engine.toUpperCase()} in the browser window that just opened.`);
console.log(`   Handle any OTP / 2FA. When the chat is fully loaded and ready,`);
console.log(`   come back HERE and press ENTER to save the session.\n`);

process.stdin.resume();
await new Promise((res) => process.stdin.once("data", res));

await context.storageState({ path: out });
console.log(`\n✔ Saved logged-in session → ${out}`);
console.log(`   (This file holds your session cookies — it is gitignored, keep it private.)\n`);

await browser.close();
process.exit(0);
