// scripts/geo-session-refresh.mjs
// ─────────────────────────────────────────────────────────────────────────────
// SESSION KEEP-ALIVE — runs DAILY on the worker host (VPS) via cron.
// Login-gated AI sessions (ChatGPT/Gemini/Copilot) expire mostly from DISUSE — their
// cookies roll/refresh on each authenticated visit. This loads each saved session,
// visits the app to refresh it, and RE-SAVES the rolled cookies back to
// .geo-sessions/<engine>.json. That pushes expiry from ~weeks out to ~months without any
// human re-login. A session that is genuinely dead (hard re-auth required) is reported as
// "expired" + written to _health.json + (optionally) POSTed to SESSION_ALERT_WEBHOOK, so a
// human can re-capture PROACTIVELY instead of discovering it mid-scan.
//
//   node scripts/geo-session-refresh.mjs                 # all login engines
//   node scripts/geo-session-refresh.mjs chatgpt gemini  # specific ones
//   (on the headless VPS, run under xvfb:  xvfb-run -a node scripts/geo-session-refresh.mjs)
// ─────────────────────────────────────────────────────────────────────────────
import { chromium } from "playwright";
import fs from "fs";

const ENGINES = {
  chatgpt: "https://chatgpt.com/",
  gemini:  "https://gemini.google.com/app",
  copilot: "https://copilot.microsoft.com/",
};
const want = process.argv.slice(2).map((s) => s.toLowerCase()).filter((e) => ENGINES[e]);
const list = want.length ? want : Object.keys(ENGINES);
const dir = ".geo-sessions";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ts = new Date().toISOString();
const results = [];

for (const e of list) {
  const f = `${dir}/${e}.json`;
  if (!fs.existsSync(f)) { results.push({ engine: e, status: "missing" }); continue; }
  let browser, context, ok = false, note = "";
  try {
    browser = await chromium.launch({ channel: "chrome", headless: false, args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"] });
    context = await browser.newContext({ storageState: f, locale: "en-US" });
    const pg = await context.newPage();
    await pg.goto(ENGINES[e], { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await sleep(8000); // let the authenticated app settle so cookies roll
    if (e === "chatgpt") {
      const r = await context.request.get("https://chatgpt.com/api/auth/session", { timeout: 20000 }).catch(() => null);
      const j = r ? await r.json().catch(() => ({})) : {};
      ok = !!(j && j.user && (j.user.email || j.user.id));
    } else {
      const cta = await pg.locator(':is(a,button):has-text("Sign in"), :is(a,button):has-text("Log in")').count().catch(() => 0);
      const comp = await pg.locator('textarea, [contenteditable="true"], div[role="textbox"]').count().catch(() => 0);
      ok = comp > 0 && cta === 0;
    }
    if (ok) { await context.storageState({ path: f }); note = "cookies refreshed + re-saved"; }
    results.push({ engine: e, status: ok ? "refreshed" : "expired", note });
  } catch (err) {
    results.push({ engine: e, status: "error", note: String(err?.message || err).slice(0, 120) });
  } finally { try { await context?.close(); } catch {} try { await browser?.close(); } catch {} }
}

for (const r of results) console.log(`[geo-session-refresh ${ts}] ${r.engine}: ${r.status}${r.note ? ` — ${r.note}` : ""}`);
try { fs.writeFileSync(`${dir}/_health.json`, JSON.stringify({ checked_at: ts, engines: results }, null, 2)); } catch {}

const dead = results.filter((r) => r.status !== "refreshed");
if (dead.length && process.env.SESSION_ALERT_WEBHOOK) {
  try {
    await fetch(process.env.SESSION_ALERT_WEBHOOK, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: `⚠️ GEO session(s) need re-capture: ${dead.map((d) => `${d.engine} (${d.status})`).join(", ")} — run: node scripts/geo-capture.mjs <engine>` }),
    });
  } catch {}
}
process.exit(dead.length ? 2 : 0);
