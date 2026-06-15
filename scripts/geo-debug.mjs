// scripts/geo-debug.mjs — calibration probe for a browser engine's answer DOM.
// Usage: node scripts/geo-debug.mjs gemini   |   node scripts/geo-debug.mjs copilot
import fs from "fs";
for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const engine = (process.argv[2] || "gemini").toLowerCase();
const URLS = { gemini: "https://gemini.google.com/app", copilot: "https://copilot.microsoft.com/" };
const url = URLS[engine];
if (!url) { console.error("usage: geo-debug.mjs <gemini|copilot>"); process.exit(1); }
const session = JSON.parse(fs.readFileSync(`.geo-sessions/${engine}.json`, "utf8"));

const token = process.env.BROWSERLESS_TOKEN;
const ws = `wss://production-sfo.browserless.io/chromium/playwright?token=${token}&proxy=residential&proxyCountry=in&timeout=60000`;
const { chromium } = await import("playwright-core");
const browser = await chromium.connect(ws);
try {
  const context = await browser.newContext({ storageState: session, locale: "en-US",
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36" });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(3000);
  const composerCount = await page.locator('textarea, [contenteditable="true"], div[role="textbox"]').count();
  console.log("composer candidates:", composerCount);
  if (composerCount) {
    const composer = page.locator('textarea, [contenteditable="true"], div[role="textbox"]').first();
    await composer.click();
    await page.keyboard.insertText("Name three SEO agencies in India.");
    await page.waitForTimeout(500);
    try { await page.locator('button[aria-label*="Send" i], button[aria-label*="Submit" i]').first().click({ timeout: 4000 }); console.log("clicked send button"); }
    catch { await page.keyboard.press("Enter"); console.log("pressed Enter"); }
    await page.waitForTimeout(20000);
  }
  const cands = await page.evaluate(() => {
    const all = [];
    const walk = (root) => { // pierce Shadow DOM (Copilot)
      root.querySelectorAll("*").forEach((e) => { all.push(e); if (e.shadowRoot) walk(e.shadowRoot); });
    };
    walk(document);
    const out = [];
    for (const el of all) {
      const t = (el.innerText || el.textContent || "").trim();
      if (t.length > 120 && t.length < 4000 && el.children.length < 40) {
        out.push({
          tag: el.tagName.toLowerCase(),
          cls: String(el.className || "").slice(0, 70),
          dataAttrs: Array.from(el.attributes || []).map((a) => a.name).filter((n) => n.startsWith("data-") || n === "jsname").join(","),
          shadow: !!el.getRootNode().host,
          len: t.length, sample: t.slice(0, 70).replace(/\s+/g, " "),
        });
      }
    }
    return out.sort((a, b) => a.len - b.len).slice(0, 15);
  });
  console.log("── candidate answer blocks (smallest first) ──");
  cands.forEach((c) => console.log(`${c.shadow?"[shadow] ":""}${c.tag}  cls="${c.cls}"  [${c.dataAttrs}]  len=${c.len} :: ${c.sample}`));
  fs.writeFileSync(`.geo-cache/debug-${engine}.html`, await page.content());
  try { await page.screenshot({ path: `.geo-cache/debug-${engine}.png`, fullPage: false }); console.log(`saved screenshot → .geo-cache/debug-${engine}.png`); } catch {}
  // iframe scan (Copilot may render chat inside an iframe)
  const frames = page.frames().map((f) => f.url()).filter((u) => u && u !== "about:blank");
  console.log("frames:", frames.length, frames.slice(0, 6).join("  "));
  console.log(`saved full HTML → .geo-cache/debug-${engine}.html`);
} finally { try { await browser.close(); } catch {} }
process.exit(0);
