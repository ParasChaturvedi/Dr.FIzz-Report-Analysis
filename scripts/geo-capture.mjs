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

const profileDir = path.join(dir, `profile-${engine}`);
fs.mkdirSync(profileDir, { recursive: true });
// Real Google Chrome + a persistent profile + light stealth → looks like a human
// browser to Cloudflare, which blocks Playwright's default Chromium.
const context = await chromium.launchPersistentContext(profileDir, {
  headless: false,
  channel: "chrome",   // use installed Google Chrome (NOT Playwright's Chromium)
  viewport: null,
  locale: "en-US",
  args: ["--disable-blink-features=AutomationControlled", "--start-maximized"],
});
await context.addInitScript(() => {
  Object.defineProperty(navigator, "webdriver", { get: () => undefined });
});
let closed = false;
context.on("close", () => { closed = true; });
const page = context.pages()[0] || (await context.newPage());
await page.goto(ENGINES[engine], { waitUntil: "domcontentloaded" }).catch(() => {});

console.log(`\n👉 Log into ${engine.toUpperCase()} in the browser window that just opened (handle OTP/2FA).`);
console.log(`   No need to touch the terminal — I auto-save the moment you're signed in.\n`);

// Detect login DEFINITIVELY via the engine's own session endpoint (uses the
// context cookies, so it sees what the logged-in user sees). A logged-out user
// gets {} / no user; a logged-in user gets their account → impossible to
// false-positive. Falls back to a page check for engines without such an endpoint.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const eTLD = new URL(ENGINES[engine]).hostname.split(".").slice(-2).join(".");
async function isLoggedIn() {
  const sessionUrl = {
    chatgpt:    "https://chatgpt.com/api/auth/session",
    perplexity: "https://www.perplexity.ai/api/auth/session",
  }[engine];
  if (sessionUrl) {
    try {
      const r = await context.request.get(sessionUrl, { timeout: 8000 });
      const j = await r.json().catch(() => ({}));
      return !!(j && j.user && (j.user.email || j.user.id || j.user.name));
    } catch { return false; }
  }
  // Fallback (gemini / copilot / claude): the engine's own page shows a chat
  // composer AND no visible "Log in / Sign in" call-to-action.
  try {
    const pg = context.pages().find((p) => { try { return new URL(p.url()).hostname.includes(eTLD); } catch { return false; } });
    if (!pg) return false;
    const cta = await pg.locator(':is(a,button):has-text("Log in"), :is(a,button):has-text("Sign in"), :is(a,button):has-text("Sign up")').count();
    const composer = await pg.locator('textarea, [contenteditable="true"], div[role="textbox"]').count();
    return composer > 0 && cta === 0;
  } catch { return false; }
}

const start = Date.now();
const deadline = start + 5 * 60 * 1000; // up to 5 minutes to log in
let saved = false;
let stable = 0;
while (Date.now() < deadline) {
  await sleep(3000);
  if (closed) {
    console.log("\n⚠ Browser window was closed before login completed. Please re-run and keep it open until I save.");
    break;
  }
  if (Date.now() - start < 8000) continue;
  const ok = await isLoggedIn();
  stable = ok ? stable + 1 : 0;     // require 2 consecutive confirmations
  if (stable >= 2) {
    await sleep(1500);
    try {
      await context.storageState({ path: out });
      console.log(`\n✔ Detected login — saved session → ${out}`);
      saved = true;
    } catch (e) { console.log("save failed:", e?.message); }
    break;
  }
}
if (!saved && !closed) {
  try { await context.storageState({ path: out }); console.log(`\n(timeout) Saved current state → ${out}. Re-run if it was not logged in.`); } catch {}
}
console.log(`   (Session file is gitignored — keep it private.)\n`);

try { await context.close(); } catch {}
process.exit(saved ? 0 : 1);
