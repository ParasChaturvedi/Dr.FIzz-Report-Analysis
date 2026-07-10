// src/lib/seo/geo/collector.js
// ─────────────────────────────────────────────────────────────────────────────
// GEO RAW-SIGNAL COLLECTOR
// Drives the AI engines (via Playwright + Browserless) and produces the
// `aiResponses` shape that the PROPRIETARY logic (buildShareOfVoice /
// buildCitationAnalysis in doctor-fizz-logic.js) turns into SoV + Citation
// intelligence. The engines are RAW SIGNAL only — all analysis lives in the logic.
//
// Two modes:
//   • mode:"mock"  → synthetic responses, no browser. Fully testable NOW.
//   • mode:"live"  → connects Playwright to Browserless (the app is serverless,
//                    so the browser is HOSTED on Browserless) and asks each engine.
//                    Needs a logged-in session (storageState) per engine.
//
// Output shape (feed straight into buildGeoVisibility({ aiResponses })):
//   { brandSet, client, clientDomain, competitorDomains, prompts, responses[], errors[] }
//   responses[i] = { engine, prompt, answerText?, brandsMentioned?, leadBrand?, citations?[] }
// ─────────────────────────────────────────────────────────────────────────────

import { buildMarketplacePrompts, MARKETPLACES } from "./marketplace-intelligence.js";

export const ENGINES = {
  // `ephemeralUrl` = a no-history / no-memory entry point. We always run each query
  // in a fresh, throwaway context (incognito-style); for ChatGPT we additionally
  // use Temporary Chat so the query never enters chat history or updates memory —
  // keeps every answer unbiased + repeatable (no personalisation drift).
  chatgpt: {
    // NOTE: temporary-chat (?temporary-chat=true) triggers a persistent "Continue" modal
    // that keeps re-rendering over the composer and destabilises generation on an automated
    // residential session. Each query already runs in a FRESH Browserless context, so we use
    // the plain URL for stable generation (history isolation comes from the throwaway context).
    name: "ChatGPT", url: "https://chatgpt.com/",
    // Scanned LOGGED-OUT (no session): chatgpt.com answers questions without an account, and the
    // Browserless stealth path clears its Cloudflare wall. `cdpStealth` routes this engine to
    // connectBrowserlessCDP() (the /chromium CDP endpoint that accepts &stealth&solveCaptchas).
    needsSession: false, cdpStealth: true, type: "chat",
    composerSel: '#prompt-textarea, div[contenteditable="true"]',
    sendSel: '[data-testid="send-button"], button[aria-label*="Send" i]',
    answerSel: '[data-message-author-role="assistant"]',
  },
  gemini: {
    name: "Gemini", url: "https://gemini.google.com/app", needsSession: true, type: "chat",
    composerSel: 'rich-textarea div[contenteditable="true"], div[contenteditable="true"][role="textbox"]',
    sendSel: 'button[aria-label*="Send" i], button.send-button',
    answerSel: '.model-response-text, message-content',
  },
  // Google AI Overviews = the AI summary on the Google SEARCH results page (NOT
  // the Gemini app). No login required; reuses the Google session if present.
  aioverviews: { name: "Google AI Overviews", url: "https://www.google.com/search", needsSession: false, type: "search" },
  perplexity: {
    name: "Perplexity", url: "https://www.perplexity.ai/", needsSession: false, type: "chat",
    composerSel: 'textarea, div[contenteditable="true"]',
    sendSel: 'button[aria-label*="Submit" i], button[aria-label*="Send" i]',
    answerSel: '.prose, [class*="answer" i], [class*="prose" i]',
  },
  copilot: {
    name: "Microsoft Copilot", url: "https://copilot.microsoft.com/", needsSession: true, type: "chat",
    composerSel: 'textarea, div[contenteditable="true"], #userInput',
    sendSel: 'button[aria-label*="Send" i], button[title*="Send" i]',
    answerSel: '[data-content="ai-message"], [class*="message" i][class*="ai" i], .ac-textBlock',
  },
  // Claude runs via the Anthropic API WITH the web_search tool — reliable, no
  // browser/session, and live web access so its marketplace findings are verifiable.
  claude: { name: "Claude", type: "api", needsSession: false },
};

// ── Prompt generator ─────────────────────────────────────────────────────────
// Builds the prompt set the scan asks every engine. Brand + category prompts
// drive Share-of-Voice; the marketplace prompt drives presence discovery (whose
// answers must be cross-verified before being trusted — LLMs can hallucinate).
export function buildGeoPrompts({ brand, industry = "your services", marketplaces = [], location = "" } = {}) {
  const ind = String(industry || "your services").toLowerCase();
  const where = location ? ` in ${location}` : "";
  const list = [
    { theme: "Category leaders",   prompt: `Who are the best ${ind} providers${where}?` },
    { theme: "Top brands",         prompt: `List the top ${ind} companies${where}.` },
    { theme: "Near me / local",    prompt: `Best ${ind}${location ? ` ${location}` : " near me"}?` },
    { theme: "Affordable",         prompt: `Most affordable ${ind}${where}?` },
    { theme: "Brand reputation",   prompt: `Is ${brand} a good ${ind} provider? What do people say?` },
    { theme: "Brand reviews",      prompt: `${brand} reviews and ratings — what are customers saying?` },
  ];
  if (marketplaces && marketplaces.length) {
    list.push({
      theme: "Marketplace presence",
      prompt: `Which directories or marketplaces is "${brand}" listed on (for example ${marketplaces.join(", ")})? Only include ones you can actually verify with a source link.`,
    });
  }
  return list.map((p, i) => ({ id: `p${i + 1}`, ...p }));
}

// ── "global" / international detection ────────────────────────────────────────
// When the caller asks for a borderless/international scan, proxyCountry is empty,
// "global", or "intl". In that case we SKIP the residential proxy (connect plain)
// and set NO country gl/locale → an un-localized query. Used by connectBrowserless
// and the AI-Overview `gl` branch so both honour the international intent.
function _isGlobal(proxyCountry) {
  const c = String(proxyCountry == null ? "" : proxyCountry).trim().toLowerCase();
  return c === "" || c === "global" || c === "intl";
}

// ── Connect Playwright → Browserless (live mode only) ────────────────────────
async function connectBrowserless(proxyCountry = "") {
  const token = process.env.BROWSERLESS_TOKEN;
  if (!token) throw new Error("BROWSERLESS_TOKEN is not set — required for the live GEO scan.");
  const base = (process.env.BROWSERLESS_ENDPOINT_BASE || "https://production-sfo.browserless.io").replace(/^http/i, "ws");
  const residential = String(process.env.BROWSERLESS_USE_RESIDENTIAL || "").trim() === "1";
  // GLOBAL scan → never attach the residential proxy or a country target (plain,
  // un-localized international IP). Country scan → keep the existing behavior.
  const global = _isGlobal(proxyCountry);
  // Country-target the residential IP so AI answers match the report's market
  // (verified: &proxy=residential&proxyCountry=in → an India IP).
  const country = global ? "" : String(proxyCountry || process.env.BROWSERLESS_PROXY_COUNTRY || "").toLowerCase();
  const proxyQs = (residential && !global) ? `&proxy=residential${country ? `&proxyCountry=${country}` : ""}` : "";
  // Browserless kills the session after `timeout` — too short for a streamed AI answer. A fresh
  // connection is made per query, so the whole scan never needs one long session.
  // NOTE: stealth + solveCaptchas are NOT valid on the /chromium/playwright endpoint (it 400s on
  // unknown params). CAPTCHA-solving for chatgpt/copilot goes through connectBrowserlessCDP() below.
  const timeoutMs = Number(process.env.BROWSERLESS_TIMEOUT_MS || 120000);
  const ws = `${base}/chromium/playwright?token=${encodeURIComponent(token)}${proxyQs}&timeout=${timeoutMs}`;
  // Dynamic import so build/serverless bundles never pull Playwright unless a
  // live scan actually runs (the browser itself is hosted on Browserless).
  let chromium;
  try { ({ chromium } = await import("playwright-core")); }
  catch { throw new Error("playwright-core is not installed — run `npm i playwright-core` to enable the live GEO scan."); }
  // Browserless `/chromium/playwright` endpoint uses the Playwright protocol →
  // chromium.connect() (NOT connectOverCDP, which is for the /chromium CDP endpoint).
  // Browserless plans cap CONCURRENT sessions — a burst returns HTTP 429. Retry the CONNECT
  // with exponential backoff + jitter so a rate-limited query WAITS for a free slot instead
  // of dropping the prompt. This is what lets a 30-prompt engine complete on a low-concurrency
  // plan (each query eventually gets a session). Only 429/rate-limit/concurrency errors retry.
  const attempts = Math.max(1, Number(process.env.BROWSERLESS_CONNECT_ATTEMPTS) || 6);
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try { return await chromium.connect(ws); }
    catch (e) {
      lastErr = e;
      const rateLimited = /\b429\b|too many requests|rate.?limit|session limit|concurrent|max.*sessions/i.test(String(e?.message || ""));
      if (!rateLimited || i === attempts - 1) throw e;
      const backoff = Math.min(25000, 3000 * Math.pow(1.7, i)) + Math.floor(Math.random() * 2000);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  throw lastErr;
}

// Stealth + CAPTCHA-solving connection for Cloudflare-gated engines (ChatGPT). The plain
// /chromium/playwright endpoint 400s on &stealth; the /chromium CDP endpoint accepts &stealth
// &solveCaptchas=true and is reached with connectOverCDP (NOT chromium.connect). Logged-out
// ChatGPT clears its "Just a moment" wall here, so no login session is needed.
async function connectBrowserlessCDP(proxyCountry = "") {
  const token = process.env.BROWSERLESS_TOKEN;
  if (!token) throw new Error("BROWSERLESS_TOKEN is not set — required for the live GEO scan.");
  const base = (process.env.BROWSERLESS_ENDPOINT_BASE || "https://production-sfo.browserless.io").replace(/^http/i, "ws");
  const residential = String(process.env.BROWSERLESS_USE_RESIDENTIAL || "").trim() === "1";
  const global = _isGlobal(proxyCountry);
  const country = global ? "" : String(proxyCountry || process.env.BROWSERLESS_PROXY_COUNTRY || "").toLowerCase();
  const proxyQs = (residential && !global) ? `&proxy=residential${country ? `&proxyCountry=${country}` : ""}` : "";
  const timeoutMs = Number(process.env.BROWSERLESS_TIMEOUT_MS || 120000);
  const ws = `${base}/chromium?token=${encodeURIComponent(token)}${proxyQs}&stealth&solveCaptchas=true&timeout=${timeoutMs}`;
  let chromium;
  try { ({ chromium } = await import("playwright-core")); }
  catch { throw new Error("playwright-core is not installed — run `npm i playwright-core` to enable the live GEO scan."); }
  const attempts = Math.max(1, Number(process.env.BROWSERLESS_CONNECT_ATTEMPTS) || 6);
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try { return await chromium.connectOverCDP(ws); }
    catch (e) {
      lastErr = e;
      const rateLimited = /\b429\b|too many requests|rate.?limit|session limit|concurrent|max.*sessions/i.test(String(e?.message || ""));
      if (!rateLimited || i === attempts - 1) throw e;
      const backoff = Math.min(25000, 3000 * Math.pow(1.7, i)) + Math.floor(Math.random() * 2000);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  throw lastErr;
}

// ── Per-engine adapter (live) ────────────────────────────────────────────────
// Generic ask → wait → extract. The selectors below are a STARTING POINT and
// MUST be calibrated per engine against a real logged-in session (the consumer
// AI apps change their DOM often). Login walls are detected and surfaced.
// Poll the assistant answer node until it appears AND stops growing (stream done).
// Reads ONLY cfg.answerSel — so we never capture page chrome or the prompt echo.
async function waitForStableAnswer(page, cfg) {
  // Bounded tight to save Browserless units; early-exits the moment the answer
  // stops growing, so a fast answer costs far less than this hard cap.
  const maxMs = Number(process.env.GEO_ANSWER_MAX_MS || 30000);
  const start = Date.now();
  let last = "", stable = 0;
  while (Date.now() - start < maxMs) {
    await page.waitForTimeout(2500);
    const txt = await page.evaluate((sel) => {
      if (!sel) return "";
      let nodes = Array.from(document.querySelectorAll(sel));
      if (!nodes.length) { // pierce Shadow DOM (Copilot renders its chat in shadow roots)
        const walk = (root) => {
          try { root.querySelectorAll(sel).forEach((e) => nodes.push(e)); } catch {}
          root.querySelectorAll("*").forEach((e) => { if (e.shadowRoot) walk(e.shadowRoot); });
        };
        walk(document);
      }
      if (!nodes.length) return "";
      // Pick the node with the MOST text, not the last one. Perplexity's `.prose` matches
      // both the full answer container AND its inner <p> fragments — the last match is a
      // sub-paragraph. The longest match is the complete answer. (Single-query fresh context
      // → one assistant turn, so this never grabs a stale earlier turn.)
      let el = nodes[0];
      for (const n of nodes) { if (String(n.innerText || n.textContent || "").length > String(el.innerText || el.textContent || "").length) el = n; }
      return String(el.innerText || el.textContent || "").trim();
    }, cfg.answerSel);
    if (txt && txt.length > 40) {
      if (txt === last) { if (++stable >= 2) return txt.slice(0, 8000); }
      else { stable = 0; last = txt; }
    }
  }
  if (last) return last.slice(0, 8000);
  // Fallback: the answer node never matched — return the tail of the body MINUS the
  // prompt echo, so a selector drift still yields *something* to calibrate against.
  const body = await page.evaluate(() => document.body.innerText || "");
  return body.replace(/\s+/g, " ").slice(-6000);
}

// ── §16 DEBUG screenshot (opt-in) ────────────────────────────────────────────
// Only when GEO_DEBUG_SCREENSHOT === "1": grab a small JPEG of the page as base64
// so a failed/odd parse can be eyeballed. Off by default (a screenshot costs time
// + Browserless units). Always best-effort — never throws into the ask flow.
async function _maybeScreenshot(page) {
  if (process.env.GEO_DEBUG_SCREENSHOT !== "1") return undefined;
  try {
    const buf = await page.screenshot({ type: "jpeg", quality: 40 });
    return Buffer.from(buf).toString("base64");
  } catch { return undefined; }
}

// Consumer AI apps gate the composer behind interstitials: ChatGPT's "Continue"
// Temporary-Chat confirmation, "Stay logged out", region notices, cookie banners.
// Click the first matching DISMISS/CONTINUE-past CTA by visible text so the composer
// becomes reachable. PRIVACY-SAFE: we never click "Accept all"/"I agree" (accepting
// terms/tracking is out of scope) — only reject/decline/close/continue-past controls.
// Best-effort + fast — never throws into the ask flow.
const _OVERLAY_CTAS = [
  /^continue$/i, /continue temporary chat/i, /^start( new)? chat/i, /stay logged out/i,
  /^reject all/i, /necessary (cookies )?only/i, /^decline/i, /^no thanks/i, /^not now/i,
  /^got it$/i, /^dismiss$/i, /^close$/i, /^skip$/i, /^maybe later/i, /^ok$/i,
];
async function dismissOverlays(page, budgetMs = 6000) {
  // POLL: these interstitials render async (ChatGPT's Temporary-Chat "Continue" modal
  // appears ~2s AFTER load), so we keep watching until the budget runs out, clicking any
  // CTA the moment it appears. Stop after two idle rounds (nothing left to dismiss).
  const deadline = Date.now() + budgetMs;
  let idle = 0;
  while (Date.now() < deadline) {
    let clicked = false;
    for (const rx of _OVERLAY_CTAS) {
      try {
        const btn = page.getByRole("button", { name: rx }).first();
        if (await btn.isVisible({ timeout: 250 }).catch(() => false)) {
          await btn.click({ timeout: 1500, force: true }).catch(() => {});
          clicked = true; await page.waitForTimeout(500); break;
        }
      } catch { /* selector unsupported — keep scanning */ }
    }
    if (clicked) { idle = 0; }
    else { if (++idle >= 2) break; await page.waitForTimeout(500); }
  }
}

// Page-level ask flow. Works with ANY Playwright context — a Browserless
// newContext seeded with storageState OR a local persistent-profile context.
// Owns only the PAGE; the caller owns the context lifecycle.
// `regionLabel` (e.g. "Mumbai, Maharashtra") is an optional STATE/CITY string the
// caller threads through: the residential proxy is country-level, but the SEARCH /
// prompt context can carry a finer location — appended to the AI-Overview query so
// the localized answer reflects the city/state, not just the country.
async function askInContext(context, cfg, prompt, proxyCountry = "", regionLabel = "") {
  const page = await context.newPage();
  const _region = String(regionLabel || "").trim();
  // Block heavy resources (images/media/fonts) → slashes residential-proxy
  // bandwidth (the main Browserless cost) and speeds loads. Text + links unaffected.
  if (String(process.env.GEO_BLOCK_HEAVY || "1") === "1") {
    try {
      await page.route("**/*", (route) => {
        const t = route.request().resourceType();
        return (t === "image" || t === "media" || t === "font") ? route.abort() : route.continue();
      });
    } catch { /* routing unsupported — proceed unblocked */ }
  }
  try {
    // ── Search-type engine (Google AI Overviews): run a Google search and grab
    //    the AI Overview block + its source links. No chat composer. ──
    if (cfg.type === "search") {
      // GLOBAL → no country gl (un-localized international SERP). Country scan →
      // keep the existing `gl` (defaults to "in" when no explicit country).
      const global = _isGlobal(proxyCountry);
      const country = global ? "" : String(proxyCountry || process.env.BROWSERLESS_PROXY_COUNTRY || "in").toLowerCase();
      // Residential proxy is country-level only; fold any finer STATE/CITY label
      // into the search text so the AI Overview is localized to the city/state.
      const q = _region ? `${prompt} ${_region}` : prompt;
      const gp = country ? `&gl=${country}` : "";
      await page.goto(`${cfg.url}?q=${encodeURIComponent(q)}${gp}&hl=en&num=10`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(3000);
      try { await page.getByRole("button", { name: /show more/i }).first().click({ timeout: 1500 }); await page.waitForTimeout(1000); } catch {}
      // Extract ONLY the AI Overview block (+ its own source links). If Google shows
      // no AI Overview for this query, contribute NO signal — never scrape the
      // organic results list (that would just be a noisy SERP `site:` check again).
      // Also return the block's raw HTML (capped) so §16 can audit the parse.
      const { answerText, citations, raw_html, _matched } = await page.evaluate(() => {
        const sels = ['div[data-attrid="AIOverview"]', '[data-attrid*="AIOverview" i]', 'div[aria-label*="AI Overview" i]', 'div[jsname][data-rl]'];
        let el = null;
        for (const s of sels) { const e = document.querySelector(s); if (e && String(e.innerText || "").trim().length > 40) { el = e; break; } }
        if (!el) return { answerText: "", citations: [], raw_html: "", _matched: false };
        const links = Array.from(el.querySelectorAll('a[href^="http"]')).map((a) => a.href)
          .filter((h) => !/google\.|gstatic|youtube\.com\/(redirect|results)|accounts\.|webcache/i.test(h));
        return {
          answerText: String(el.innerText || "").slice(0, 8000),
          citations: [...new Set(links)].slice(0, 30),
          raw_html: String(el.innerHTML || el.outerHTML || "").slice(0, 20000),
          _matched: true,
        };
      });
      // §16 parse_confidence: high when the AI-Overview node was found AND it had
      // citations; medium when text exists but no citations; low when empty.
      const parse_confidence = !answerText ? 0.2 : (_matched && citations.length ? 0.9 : 0.5);
      const screenshot = await _maybeScreenshot(page);
      const out = { engine: cfg.name, prompt, answerText, citations, raw_html, parse_confidence };
      if (screenshot) out.screenshot = screenshot;
      return out;
    }

    // Ephemeral entry point (ChatGPT Temporary Chat etc.) → no history / no memory.
    await page.goto(cfg.ephemeralUrl || cfg.url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1200); // brief SPA hydration; composer.waitFor handles readiness
    await dismissOverlays(page);     // clear ChatGPT "Continue" / "stay logged out" / consent gates

    // Login-wall detection (calibration point): if the composer never appears,
    // the session has expired → caller should refresh that engine's storageState.
    // The engine selector is OR'd with a generic fallback for resilience.
    const composerSel = cfg.composerSel
      ? `${cfg.composerSel}, textarea, div[role="textbox"]`
      : 'textarea, [contenteditable="true"], div[role="textbox"]';
    // Pick the first VISIBLE composer. ChatGPT (and others) ship a HIDDEN fallback
    // <textarea> alongside the real ProseMirror/contenteditable div — a plain .first()
    // grabs the hidden one and waitFor(visible) then times out forever. Loop to the
    // first actually-visible match (version-agnostic; no .filter({visible}) dependency).
    const firstVisible = async (timeoutMs) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const all = page.locator(composerSel);
        const n = await all.count().catch(() => 0);
        for (let i = 0; i < n; i++) {
          const c = all.nth(i);
          if (await c.isVisible().catch(() => false)) return c;
        }
        await page.waitForTimeout(600);
      }
      return null;
    };
    let composer = await firstVisible(35000);
    if (!composer) {
      // an interstitial may have rendered late (SPA) — dismiss again and retry once
      await dismissOverlays(page);
      composer = await firstVisible(15000);
    }
    if (!composer) throw new Error(`${cfg.name}: composer never became visible (login wall or DOM drift).`);
    // Normal click first; if a residual backdrop intercepts pointer events, force it,
    // then fall back to focus() — all we need is the composer focused so insertText lands.
    await composer.click({ timeout: 6000 })
      .catch(() => composer.click({ timeout: 4000, force: true }))
      .catch(() => composer.focus().catch(() => {}));

    // insertText pastes the whole prompt at once (no per-key Enter) so a multi-line
    // prompt never submits early. Then submit via the SEND BUTTON (Enter often just
    // inserts a newline in these rich composers); fall back to Enter.
    await page.keyboard.insertText(prompt);
    await page.waitForTimeout(400);
    // A late interstitial (ChatGPT temp-chat "Continue") can render over the composer
    // between focus and submit — clear it, re-focus, and re-type if the dismissal wiped
    // the field, so the send always lands on a composer that actually holds the prompt.
    await dismissOverlays(page, 3000);
    await composer.click({ timeout: 3000 }).catch(() => composer.focus().catch(() => {}));
    const hasText = await composer.evaluate((el) => ((el.innerText || el.value || "").trim().length > 0)).catch(() => true);
    if (!hasText) { await page.keyboard.insertText(prompt); await page.waitForTimeout(300); }
    let sent = false;
    if (cfg.sendSel) {
      try {
        const btn = page.locator(cfg.sendSel).first();
        await btn.waitFor({ state: "visible", timeout: 5000 });
        await btn.click({ timeout: 4000 });
        sent = true;
      } catch { /* fall back to Enter */ }
    }
    if (!sent) await page.keyboard.press("Enter");

    // Cloudflare Turnstile "Verify you are human" sometimes gates the answer
    // (notably Copilot). Only attempt a click when the challenge frame is actually
    // present (page.frames() is instant) — so engines without a challenge pay no
    // penalty and stay within the 60s session budget.
    if (page.frames().some((f) => /challenges\.cloudflare\.com/.test(f.url()))) {
      try {
        const cf = page.frameLocator('iframe[src*="challenges.cloudflare.com"]');
        await cf.locator('input[type="checkbox"], label, body').first().click({ timeout: 3000 });
        await page.waitForTimeout(3000);
      } catch { /* challenge not clickable headlessly */ }
    }

    // Wait for the assistant turn to APPEAR and stop growing (stream settled),
    // reading only the answer node — never the page chrome or the prompt echo.
    let answerText = await waitForStableAnswer(page, cfg);
    // One retry for a transient generation error (ChatGPT "Something went wrong … Retry",
    // Gemini "Something went wrong"). Only when the answer is an error stub, not a real answer.
    if (answerText.length < 400 && /something went wrong|an error occurred|try again|network error|please try again/i.test(answerText)) {
      try {
        const retry = page.getByRole("button", { name: /^(retry|try again|regenerate)/i }).first();
        if (await retry.isVisible({ timeout: 2500 }).catch(() => false)) {
          await retry.click({ force: true }).catch(() => {});
          await page.waitForTimeout(1500);
          answerText = await waitForStableAnswer(page, cfg);
        }
      } catch { /* no retry control — keep the original text */ }
    }
    // §16 raw_html: the answer node's innerHTML (capped). `nodeMatched` tells us the
    // configured answerSel actually matched (so we know whether the text above came
    // cleanly from the answer node or from the body-tail fallback) → feeds confidence.
    const { raw_html, nodeMatched } = await page.evaluate((sel) => {
      if (!sel) return { raw_html: "", nodeMatched: false };
      let nodes = Array.from(document.querySelectorAll(sel));
      if (!nodes.length) { // pierce Shadow DOM (same traversal as waitForStableAnswer)
        const walk = (root) => {
          try { root.querySelectorAll(sel).forEach((e) => nodes.push(e)); } catch {}
          root.querySelectorAll("*").forEach((e) => { if (e.shadowRoot) walk(e.shadowRoot); });
        };
        walk(document);
      }
      if (!nodes.length) return { raw_html: "", nodeMatched: false };
      let el = nodes[0];
      for (const n of nodes) { if (String(n.innerText || n.textContent || "").length > String(el.innerText || el.textContent || "").length) el = n; }
      return { raw_html: String(el.innerHTML || el.outerHTML || "").slice(0, 20000), nodeMatched: true };
    }, cfg.answerSel);
    const citationsRaw = await page.evaluate((sel) => {
      const links = new Set();
      const collect = (root) => { if (root) root.querySelectorAll('a[href^="http"]').forEach((a) => links.add(a.href)); };
      // 1) inline citations INSIDE the answer node (superscript/numbered links).
      if (sel) { const n = document.querySelectorAll(sel); if (n.length) { let root = n[0]; for (const e of n) { if (String(e.innerText || e.textContent || "").length > String(root.innerText || root.textContent || "").length) root = e; } collect(root); } }
      // 2) the engine's DEDICATED sources region — Perplexity "Sources", Gemini "Sources and
      //    related content", ChatGPT source pills, Copilot footnotes — matched generically by
      //    class/aria so we capture WHO WAS CITED wherever it renders, not just the answer body.
      document.querySelectorAll('[class*="source" i],[class*="citation" i],[class*="reference" i],[class*="footnote" i],[aria-label*="source" i],[aria-label*="citation" i],a[class*="citation" i]').forEach(collect);
      // Keep only EXTERNAL cited domains (drop the engine's own UI/nav hosts).
      return [...links].filter((h) => !/(chatgpt|openai|google\.com|gemini\.google|accounts\.|perplexity\.ai\/?$|microsoft\.com|bing\.com|copilot|claude\.ai|anthropic|gstatic)/i.test(h));
    }, cfg.answerSel);
    const citations = [...new Set(citationsRaw)].slice(0, 30);
    // §16 parse_confidence: high (0.9) when the answer node matched cleanly AND
    // citations parsed; medium (0.5) when answer text exists but no citations OR we
    // fell back off the answer node; low (0.2) when no usable answer at all.
    const parse_confidence = (!answerText || answerText.length <= 40)
      ? 0.2
      : (nodeMatched && citations.length ? 0.9 : 0.5);
    const screenshot = await _maybeScreenshot(page);
    const out = { engine: cfg.name, prompt, answerText, citations, raw_html, parse_confidence };
    if (screenshot) out.screenshot = screenshot;
    return out;
  } finally {
    await page.close().catch(() => {});
  }
}

// Market timezone so answers are region-aligned and never time-personalised by drift.
const _TZ_FOR = { in: "Asia/Kolkata", us: "America/New_York", gb: "Europe/London", au: "Australia/Sydney", ca: "America/Toronto", ae: "Asia/Dubai", sg: "Asia/Singapore", de: "Europe/Berlin", fr: "Europe/Paris" };

// Browserless transport: fresh context seeded with the captured storageState.
// HISTORY-FREE GUARANTEE: each query runs in a BRAND-NEW context (no state bleeds
// between queries). For no-login engines there is no account → cookies are cleared so
// the answer is 100% logged-out and un-personalised. Session engines keep ONLY their
// auth; ChatGPT additionally uses Temporary Chat and every engine opens a fresh chat,
// so no chat history or account memory is ever read. Account-level memory/activity
// (e.g. Gemini Apps Activity) must be turned OFF once on each login account.
async function askEngine(browser, engineKey, prompt, storageState, proxyCountry = "in", regionLabel = "") {
  const cfg = ENGINES[engineKey];
  if (!cfg) throw new Error(`Unknown engine: ${engineKey}`);
  if (cfg.needsSession && !storageState) throw new Error(`${cfg.name}: no logged-in session provided (needs storageState).`);
  // #throttle — optional JITTERED delay before each browser query to space requests out
  // and avoid rate-limit / bot blocks on big runs (GEO_QUERY_DELAY_MS, e.g. 4000 → ~2-6s).
  const _delay = Number(process.env.GEO_QUERY_DELAY_MS) || 0;
  if (_delay > 0) await new Promise((r) => setTimeout(r, Math.round(_delay * (0.5 + Math.random()))));
  // GLOBAL scan → no country locale: keep the default en-US/UTC-ish neutral context
  // (UTC timezone) instead of pinning a market tz. Country scan → unchanged.
  const global = _isGlobal(proxyCountry);
  const context = await browser.newContext({
    storageState: storageState || undefined,
    locale: "en-US",
    timezoneId: global ? "Etc/UTC" : (_TZ_FOR[String(proxyCountry || "in").toLowerCase()] || "Asia/Kolkata"),
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  });
  // No-login engine → guarantee a clean, logged-out, un-personalised session every query.
  if (!storageState) { try { await context.clearCookies(); } catch {} }
  try { return await askInContext(context, cfg, prompt, proxyCountry, regionLabel); }
  finally { await context.close().catch(() => {}); }
}

// ── API adapter: Claude via Anthropic SDK + web_search tool ──────────────────
// Live web access → Claude can actually verify marketplace presence and cite real
// URLs (not hallucinate). No browser, no session — just the API key.
async function askClaudeAPI(prompt, regionLabel = "") {
  let Anthropic;
  try { ({ default: Anthropic } = await import("@anthropic-ai/sdk")); }
  catch { throw new Error("@anthropic-ai/sdk not installed — required for the Claude engine."); }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set — required for the Claude engine.");
  const model = process.env.GEO_CLAUDE_MODEL || process.env.CLAUDE_MODEL || "claude-sonnet-4-6";
  const client = new Anthropic({ apiKey, timeout: 60000 });

  // The base prompt usually already carries the country location; if a finer
  // STATE/CITY label is threaded through, fold it into the prompt text (no DOM
  // here, so location can only live in the prompt for the chat/API transport).
  const _region = String(regionLabel || "").trim();
  const askText = _region ? `${prompt}\n\n(Focus on ${_region}.)` : prompt;

  const resp = await client.messages.create({
    model,
    max_tokens: 1024,
    messages: [{ role: "user", content: askText }],
    // Server-side web search → real, current, citable answers. max_uses is the #1 GEO
    // cost driver (web_search is billed ~$0.01/search, separate from tokens), so it's
    // capped via GEO_WEB_SEARCH_MAX (default lowered to 3; set 1-2 for cheap full runs).
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: Math.max(1, Number(process.env.GEO_WEB_SEARCH_MAX) || 3) }],
  });

  let answerText = "";
  const citations = [];
  for (const block of resp.content || []) {
    if (block.type === "text") {
      answerText += block.text;
      for (const c of block.citations || []) { if (c?.url) citations.push(c.url); }
    } else if (block.type === "web_search_tool_result") {
      for (const r of (block.content || [])) { if (r?.url) citations.push(r.url); }
    }
  }
  // also harvest any bare URLs in the prose
  const bare = (answerText.match(/https?:\/\/[^\s)>\]"'`]+/gi) || []).map((u) => u.replace(/[.,;)]+$/, ""));
  const finalCitations = [...new Set([...citations, ...bare])]
    .filter((h) => !/anthropic|claude\.ai/i.test(h)).slice(0, 30);
  // §16 — no DOM on the API transport → raw_html is "". parse_confidence: high when
  // an answer came back WITH citations, medium when text but no citations, low when empty.
  const parse_confidence = !answerText.trim() ? 0.2 : (finalCitations.length ? 0.9 : 0.5);
  return {
    engine: ENGINES.claude.name, prompt,
    answerText: answerText.slice(0, 8000),
    citations: finalCitations,
    raw_html: "",
    parse_confidence,
  };
}

// ── Mock adapter (no browser — testable now) ─────────────────────────────────
function mockResponses({ brandSet, prompts, engineKeys }) {
  const lead = brandSet[1] || brandSet[0]; // a competitor leads, client trails (realistic)
  const slug = (s) => String(s || "").toLowerCase().replace(/\s+/g, "-");
  const out = [];
  for (const ek of engineKeys) {
    const eName = ENGINES[ek]?.name || ek;
    for (const p of prompts) {
      const tag = { brand: p.brand, theme: p.theme, promptId: p.id };
      if (p.theme === "Marketplace presence") {
        const b = p.brand || brandSet[0];
        out.push({
          engine: eName, prompt: p.prompt, ...tag,
          answerText: `${b} has active profiles on Clutch and JustDial.`,
          citations: [`https://clutch.co/profile/${slug(b)}`, `https://www.justdial.com/${slug(b).replace(/-/g, "")}`],
        });
      } else {
        out.push({
          engine: eName, prompt: p.prompt, ...tag,
          brandsMentioned: brandSet.slice(0, Math.min(3, brandSet.length)),
          leadBrand: lead,
          citations: ["https://idntimes.com/x", "https://clutch.co/y", "https://reddit.com/z"],
        });
      }
    }
  }
  return out;
}

// ── Transport: Browserless (hosted browser, production) ──────────────────────
// A FRESH connection per query: each stays well under the Browserless session
// timeout AND is fully ephemeral (incognito) — no state bleeds between queries.
async function _runBrowserless({ engineKeys, prompts, sessions, proxyCountry, regionLabel = "" }) {
  const attempts = Number(process.env.GEO_QUERY_ATTEMPTS) || 2; // one retry by default: absorbs a transient Browserless/Cloudflare blip
  // §16 region label for the metadata: prefer the explicit STATE/CITY label, else
  // the country, else "global" for an un-localized international scan.
  const _regionMeta = String(regionLabel || "").trim() || (_isGlobal(proxyCountry) ? "global" : (proxyCountry || "in"));

  // Build the full (engine × prompt) task list, then run it through a bounded CONCURRENCY
  // POOL so ~20-25 prompts × up to 6 engines (100-150 queries) finish inside the 300s
  // limit — sequentially this would take 10-20 min. Each query still uses a FRESH,
  // ephemeral Browserless connection (no state bleed). Concurrency is capped to the
  // Browserless plan's parallel-session limit via GEO_CONCURRENCY (default 6).
  // EVERY engine runs EVERY prompt — no sampling, no dummy data. Speed comes from the concurrency
  // pool below (up to 10 parallel Browserless browsers), not from cutting the workload.
  const tasks = [];
  for (const ek of engineKeys) for (const p of prompts) tasks.push({ ek, p });

  const runOne = async ({ ek, p }) => {
    const cfg = ENGINES[ek];
    const tag = { brand: p.brand, theme: p.theme, promptId: p.id };
    let lastErr = null;
    for (let a = 0; a < attempts; a++) {
      let browser;
      try {
        // Cloudflare-gated engines (ChatGPT) connect through the stealth + CAPTCHA-solving CDP
        // endpoint; everything else uses the plain Playwright endpoint.
        browser = cfg?.cdpStealth ? await connectBrowserlessCDP(proxyCountry) : await connectBrowserless(proxyCountry);
        const _r = await askEngine(browser, ek, p.prompt, sessions[ek], proxyCountry, regionLabel);
        // §16 — capture per-run metadata; raw_html/parse_confidence/screenshot ride along via the spread.
        return {
          ...(_r), ...tag,
          region: _regionMeta,
          timestamp: new Date().toISOString(),
          answer_length: String(_r?.answerText || "").length,
          citation_count: Array.isArray(_r?.citations) ? _r.citations.length : 0,
          attempts: a + 1,
        };
      } catch (err) { lastErr = err; }
      finally { try { await browser?.close(); } catch {} }
    }
    return { engine: cfg?.name || ek, prompt: p.prompt, ...tag, error: String(lastErr?.message || lastErr) };
  };

  // Hosted Browserless caps CONCURRENT sessions per plan — too many parallel connects → 429.
  // Cap the browserless pass at a safe residential-session concurrency (default 2; override via
  // BROWSERLESS_MAX_CONCURRENCY) so we stay under the plan limit. The connect-retry handles any
  // residual bursts. Local transport ignores this cap (no hosted-session limit).
  // Browserless plan allows ~5 concurrent sessions (live-tested: 10 parallel connects → 5 succeed,
  // 5 return 429). Run the pool at 5 so every query gets a real slot with no 429 churn; the
  // connect-retry below still absorbs the occasional burst. Bump both if the plan is upgraded.
  const _bMax = Math.max(1, Number(process.env.BROWSERLESS_MAX_CONCURRENCY) || 5);
  const CONCURRENCY = Math.max(1, Math.min(Number(process.env.GEO_CONCURRENCY) || 5, _bMax));
  // TIME GUARD: stop launching NEW queries past this deadline so the scan always returns
  // within the 300s function limit. The report then shows REAL (partial) Share-of-Voice
  // from whatever completed — never a perpetual "Pending live scan" caused by a timeout.
  const start = Date.now();
  // Budget the SCAN to leave room for prompt-gen (~30s before) + §25 analysis (~15s after)
  // + the in-flight tail, inside the 300s function limit. 170s here means the whole route
  // returns by ~240s and ALWAYS caches the real (partial) Share-of-Voice it collected.
  const DEADLINE_MS = Number(process.env.GEO_SCAN_DEADLINE_MS || 170000);
  const responses = new Array(tasks.length);
  let next = 0;
  const worker = async () => {
    while (true) {
      if (Date.now() - start > DEADLINE_MS) return;        // time-guard hit → stop taking new tasks
      const i = next++;
      if (i >= tasks.length) return;
      responses[i] = await runOne(tasks[i]);
    }
  };
  // HARD cap: the launch-guard above stops TAKING new tasks, but Promise.all still waits for
  // in-flight queries — and a single hung Browserless connect can block the return past the
  // 300s function limit (→ the function is killed and nothing caches → "Pending live scan").
  // This race abandons any stragglers so the scan ALWAYS returns the real responses it has.
  const workers = Array.from({ length: Math.min(CONCURRENCY, tasks.length || 1) }, worker);
  const hardCap = new Promise((res) => setTimeout(res, Number(process.env.GEO_SCAN_HARD_MS || 200000)));
  await Promise.race([Promise.all(workers), hardCap]);
  return responses.filter(Boolean);   // real responses collected so far (stragglers abandoned)
}

// ── Transport: LOCAL persistent profiles (.geo-sessions/profile-<engine>) ────
// Reuses the real Chrome profiles captured by scripts/geo-capture.mjs — already
// logged in and Cloudflare-cleared. One window per engine, reused across prompts.
// Hard wall around any awaited browser step: races it against a deadline so a wedged Chrome
// page (a hung evaluate/navigation whose internal timeout never fires) can NEVER stall the
// whole scan. The losing branch keeps running in the background but its result is ignored.
const _withTimeout = (promise, ms, label = "operation") =>
  Promise.race([
    Promise.resolve(promise),
    new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);

async function _runLocal({ engineKeys, prompts, proxyCountry = "", regionLabel = "" }) {
  let chromium;
  try { ({ chromium } = await import("playwright")); }
  catch { throw new Error("playwright (full) not installed — run `npm i -D playwright && npx playwright install chromium` for the local GEO scan."); }
  const path = await import("path");
  const fs = await import("fs");
  const responses = [];
  // Hard caps so one wedged engine/page can't hang the whole run (the cause of the
  // never-completing local run). A legit answer needs ≤~90s (composer 35s + answer 30s +
  // overhead), so 120s kills only true hangs; launch should be near-instant.
  const PROMPT_HARD_MS = Number(process.env.GEO_PROMPT_HARD_MS || 120000);
  const LAUNCH_HARD_MS = Number(process.env.GEO_LAUNCH_HARD_MS || 60000);
  // §16 region label for the metadata, mirroring the Browserless transport.
  const _regionMeta = String(regionLabel || "").trim() || (_isGlobal(proxyCountry) ? "global" : (proxyCountry || "in"));
  for (const ek of engineKeys) {
    const cfg = ENGINES[ek];
    if (!cfg) continue;
    const profileDir = path.join(".geo-sessions", `profile-${ek}`);
    const stateFile = path.join(".geo-sessions", `${ek}.json`);
    const tagFor = (p) => ({ engine: cfg.name, prompt: p.prompt, brand: p.brand, theme: p.theme, promptId: p.id });

    // Session resolution for login-gated engines, best → fallback:
    //   1. a local persistent Chrome profile (Cloudflare-cleared) captured on THIS machine
    //   2. a PORTABLE storageState — a local <engine>.json, else from Mongo/env (loadGeoSession)
    // (2) lets a session captured on another machine (e.g. a Mac) run on this headless worker.
    const haveProfile = fs.existsSync(profileDir);
    let storageState = null;
    if (cfg.needsSession && !haveProfile) {
      if (fs.existsSync(stateFile)) storageState = stateFile;
      else { try { const { loadGeoSession } = await import("./sessions.js"); const s = await loadGeoSession(ek); if (s) storageState = s; } catch {} }
      if (!storageState) {
        for (const p of prompts) responses.push({ ...tagFor(p), error: `no session for ${ek} — capture (node scripts/geo-capture.mjs ${ek}) or store one (env GEO_SESSION_${ek.toUpperCase()} / Mongo).` });
        continue;
      }
    }

    // Open this engine's context — persistent profile (Cloudflare-cleared) or a fresh context
    // seeded with the portable storageState. Wrapped in a closure so it can be RECYCLED if a
    // prompt wedges the page (see the per-prompt hard timeout below).
    const _open = async () => {
      if (haveProfile || !cfg.needsSession) {
        fs.mkdirSync(profileDir, { recursive: true });
        const context = await chromium.launchPersistentContext(profileDir, {
          headless: false, channel: "chrome", viewport: null, locale: "en-US",
          args: ["--disable-blink-features=AutomationControlled", "--start-maximized"],
        });
        return { context, browser: null };
      }
      // Portable storageState path — fresh context seeded with the captured cookies.
      const browser = await chromium.launch({ headless: false, channel: "chrome", args: ["--disable-blink-features=AutomationControlled", "--start-maximized"] });
      const context = await browser.newContext({ storageState, locale: "en-US", viewport: null });
      return { context, browser };
    };
    const _seed = async (context) => { try { await context.addInitScript(() => { Object.defineProperty(navigator, "webdriver", { get: () => undefined }); }); } catch {} };
    const _shut = async (c, b) => { try { await _withTimeout(Promise.resolve(c?.close?.()), 12000, "ctx close"); } catch {} try { await _withTimeout(Promise.resolve(b?.close?.()), 12000, "browser close"); } catch {} };

    let context = null, browser = null;
    try {
      ({ context, browser } = await _withTimeout(_open(), LAUNCH_HARD_MS, `${ek} launch`));
      await _seed(context);
      for (const p of prompts) {
        try {
          // HARD WALL: a wedged Chrome page must never stall the whole scan. If one prompt
          // exceeds the cap we record it as an error and move on — one slow engine can't hang
          // the worker (the root cause of the never-completing run).
          const _r = await _withTimeout(askInContext(context, cfg, p.prompt, proxyCountry, regionLabel), PROMPT_HARD_MS, `${cfg.name} ask`);
          // §16 — capture per-run metadata, same fields as the Browserless transport.
          // raw_html / parse_confidence / screenshot ride along from `_r` via the spread.
          responses.push({
            ...(_r), brand: p.brand, theme: p.theme, promptId: p.id,
            region: _regionMeta,
            timestamp: new Date().toISOString(),
            answer_length: String(_r?.answerText || "").length,
            citation_count: Array.isArray(_r?.citations) ? _r.citations.length : 0,
            attempts: 1,
          });
        }
        catch (err) {
          responses.push({ ...tagFor(p), error: String(err?.message || err) });
          // A hard timeout usually means the page/context wedged — recycle it so the rest of
          // this engine's prompts aren't poisoned by one stuck answer.
          if (/timed out/i.test(String(err?.message || ""))) {
            await _shut(context, browser); context = null; browser = null;
            try { ({ context, browser } = await _withTimeout(_open(), LAUNCH_HARD_MS, `${ek} relaunch`)); await _seed(context); }
            catch { break; }   // cannot reopen → stop this engine; the others still run
          }
        }
      }
    } catch (err) {
      for (const p of prompts) responses.push({ ...tagFor(p), error: String(err?.message || err) });
    } finally { await _shut(context, browser); }
  }
  return responses;
}

// ── Transport: API engines (Claude) — no browser ────────────────────────────
async function _runApi({ engineKeys, prompts, proxyCountry, regionLabel = "" }) {
  const responses = [];
  // §16 region label for the metadata, mirroring the Browserless transport.
  const _regionMeta = String(regionLabel || "").trim() || (_isGlobal(proxyCountry) ? "global" : (proxyCountry || "in"));
  for (const ek of engineKeys) {
    const cfg = ENGINES[ek];
    // #cost — the Claude engine runs paid web_search PER prompt. On big/full runs cap it
    // to a representative sample (GEO_CLAUDE_SAMPLE, e.g. 20) so it doesn't web-search 200×
    // — the browser engines still cover all prompts at ₹0. 0/unset = run every prompt.
    const sample = Number(process.env.GEO_CLAUDE_SAMPLE) || 0;
    const enginePrompts = (ek === "claude" && sample > 0) ? prompts.slice(0, sample) : prompts;
    for (const p of enginePrompts) {
      const tag = { brand: p.brand, theme: p.theme, promptId: p.id };
      try {
        if (ek === "claude") {
          const _r = await askClaudeAPI(p.prompt, regionLabel);
          // §16 — capture per-run metadata, same fields as the Browserless transport.
          // raw_html ("") / parse_confidence ride along from `_r` via the spread.
          responses.push({
            ...(_r), ...tag,
            region: _regionMeta,
            timestamp: new Date().toISOString(),
            answer_length: String(_r?.answerText || "").length,
            citation_count: Array.isArray(_r?.citations) ? _r.citations.length : 0,
            attempts: 1,
          });
        }
        else throw new Error(`No API adapter for engine "${ek}"`);
      } catch (err) {
        responses.push({ engine: cfg?.name || ek, prompt: p.prompt, ...tag, error: String(err?.message || err) });
      }
    }
  }
  return responses;
}

// ── Unified runner ───────────────────────────────────────────────────────────
// Splits engines by type: API engines (Claude) run keyless via the SDK; the rest
// run through the chosen browser transport. Both contribute to the same response set.
async function _runPrompts({ mode, transport, engineKeys, prompts, sessions, proxyCountry, brandSet, regionLabel = "" }) {
  if (mode !== "live") return mockResponses({ brandSet, prompts, engineKeys });
  const apiKeys = engineKeys.filter((k) => ENGINES[k]?.type === "api");
  const browserKeys = engineKeys.filter((k) => ENGINES[k] && ENGINES[k].type !== "api");
  const out = [];
  if (apiKeys.length) out.push(...(await _runApi({ engineKeys: apiKeys, prompts, proxyCountry, regionLabel })));
  if (browserKeys.length) {
    out.push(...(transport === "local"
      ? await _runLocal({ engineKeys: browserKeys, prompts, proxyCountry, regionLabel })
      : await _runBrowserless({ engineKeys: browserKeys, prompts, sessions, proxyCountry, regionLabel })));
  }
  return out;
}

// ── Orchestrator: SoV / Citation scan ────────────────────────────────────────
export async function runGeoScan(opts = {}) {
  const {
    mode = "mock",
    transport = "browserless",   // "browserless" (hosted) | "local" (captured profiles)
    brand,
    clientDomain = "",
    competitors = [],
    competitorDomains = [],
    industry = "",
    marketplaces = [],
    location = "",
    proxyCountry = "in",    // residential-IP country (matches the report's market)
    regionLabel = "",       // optional STATE/CITY label (e.g. "Mumbai, Maharashtra"),
                            // woven into the localized query; proxy stays country-level.
    engineKeys = ["chatgpt", "gemini", "aioverviews", "perplexity", "claude"],
    sessions = {},          // { chatgpt: storageState, gemini: ..., ... }
    prompts: customPrompts,
  } = opts;

  if (!brand) throw new Error("runGeoScan: `brand` is required.");
  const brandSet = [brand, ...competitors].filter(Boolean);
  const prompts = customPrompts || buildGeoPrompts({ brand, industry, marketplaces, location });

  const responses = await _runPrompts({ mode, transport, engineKeys, prompts, sessions, proxyCountry, brandSet, regionLabel });

  return {
    brandSet,
    client: brand,
    clientDomain,
    competitorDomains,
    prompts,
    responses: responses.filter((r) => !r.error),
    errors: responses.filter((r) => r.error),
  };
}

// ── Orchestrator: Marketplace / directory presence scan ──────────────────────
// Drives all engines with the per-brand marketplace template (client + each
// competitor). Feed `responses` straight into buildMarketplaceIntelligence().
export async function runMarketplaceScan(opts = {}) {
  const {
    mode = "mock",
    transport = "browserless",
    client,
    clientSite = "",
    clientDomain = "",
    competitors = [],
    marketplaces,
    proxyCountry = "in",
    regionLabel = "",       // optional STATE/CITY label, threaded into localized queries.
    engineKeys = ["chatgpt", "gemini", "aioverviews", "perplexity", "claude"],
    sessions = {},
  } = opts;

  const brand = client || opts.brand;
  if (!brand) throw new Error("runMarketplaceScan: `client` (brand) is required.");
  const mps = marketplaces && marketplaces.length ? marketplaces : MARKETPLACES;
  const site = clientSite || clientDomain;
  const prompts = buildMarketplacePrompts({ client: brand, clientSite: site, competitors, marketplaces: mps });
  const brandSet = [brand, ...competitors.map((c) => (typeof c === "string" ? c : c.name))].filter(Boolean);

  const responses = await _runPrompts({ mode, transport, engineKeys, prompts, sessions, proxyCountry, brandSet, regionLabel });

  return {
    client: brand,
    clientSite: site,
    competitors,
    marketplaces: mps,
    prompts,
    responses: responses.filter((r) => !r.error),
    errors: responses.filter((r) => r.error),
  };
}

// ── Real-URL verifier (optional confidence booster for the synthesis) ────────
// Promotes a URL-backed marketplace finding to "verified" on a clean 200 + brand
// match. A block/timeout returns ok:false → NO promotion and NO penalty (the
// cross-LLM consensus confidence still stands). Used only on the live path.
export function makeUrlVerifier({ timeoutMs = 8000 } = {}) {
  return async function verifyUrl(url, brand = "") {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch(url, {
        redirect: "follow", signal: ctrl.signal,
        headers: { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36" },
      });
      clearTimeout(t);
      if (!res.ok) return { ok: false };
      let matched = true;
      try {
        const body = (await res.text()).toLowerCase();
        if (brand) matched = body.includes(String(brand).toLowerCase().split(" ")[0]);
      } catch { /* body unreadable — keep matched=true (200 is enough) */ }
      return { ok: true, matched };
    } catch { return { ok: false }; }
  };
}
