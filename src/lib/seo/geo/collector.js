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
    name: "ChatGPT", url: "https://chatgpt.com/", ephemeralUrl: "https://chatgpt.com/?temporary-chat=true",
    needsSession: true, type: "chat",
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

// ── Connect Playwright → Browserless (live mode only) ────────────────────────
async function connectBrowserless(proxyCountry = "") {
  const token = process.env.BROWSERLESS_TOKEN;
  if (!token) throw new Error("BROWSERLESS_TOKEN is not set — required for the live GEO scan.");
  const base = (process.env.BROWSERLESS_ENDPOINT_BASE || "https://production-sfo.browserless.io").replace(/^http/i, "ws");
  const residential = String(process.env.BROWSERLESS_USE_RESIDENTIAL || "").trim() === "1";
  // Country-target the residential IP so AI answers match the report's market
  // (verified: &proxy=residential&proxyCountry=in → an India IP).
  const country = String(proxyCountry || process.env.BROWSERLESS_PROXY_COUNTRY || "").toLowerCase();
  const proxyQs = residential ? `&proxy=residential${country ? `&proxyCountry=${country}` : ""}` : "";
  // Browserless kills the session after `timeout` (default ~30s) — too short for a
  // streamed AI answer. Default 60,000 (the free-plan max) covers one query; a paid
  // plan can raise it via BROWSERLESS_TIMEOUT_MS for slow engines. A fresh connection
  // is made per query, so the whole scan never needs one long session.
  const timeoutMs = Number(process.env.BROWSERLESS_TIMEOUT_MS || 60000);
  const ws = `${base}/chromium/playwright?token=${encodeURIComponent(token)}${proxyQs}&timeout=${timeoutMs}`;
  // Dynamic import so build/serverless bundles never pull Playwright unless a
  // live scan actually runs (the browser itself is hosted on Browserless).
  let chromium;
  try { ({ chromium } = await import("playwright-core")); }
  catch { throw new Error("playwright-core is not installed — run `npm i playwright-core` to enable the live GEO scan."); }
  // Browserless `/chromium/playwright` endpoint uses the Playwright protocol →
  // chromium.connect() (NOT connectOverCDP, which is for the /chromium CDP endpoint).
  return chromium.connect(ws);
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
      const el = nodes[nodes.length - 1];
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

// Page-level ask flow. Works with ANY Playwright context — a Browserless
// newContext seeded with storageState OR a local persistent-profile context.
// Owns only the PAGE; the caller owns the context lifecycle.
async function askInContext(context, cfg, prompt) {
  const page = await context.newPage();
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
      const country = (process.env.BROWSERLESS_PROXY_COUNTRY || "in").toLowerCase();
      await page.goto(`${cfg.url}?q=${encodeURIComponent(prompt)}&gl=${country}&hl=en&num=10`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(3000);
      try { await page.getByRole("button", { name: /show more/i }).first().click({ timeout: 1500 }); await page.waitForTimeout(1000); } catch {}
      // Extract ONLY the AI Overview block (+ its own source links). If Google shows
      // no AI Overview for this query, contribute NO signal — never scrape the
      // organic results list (that would just be a noisy SERP `site:` check again).
      const { answerText, citations } = await page.evaluate(() => {
        const sels = ['div[data-attrid="AIOverview"]', '[data-attrid*="AIOverview" i]', 'div[aria-label*="AI Overview" i]', 'div[jsname][data-rl]'];
        let el = null;
        for (const s of sels) { const e = document.querySelector(s); if (e && String(e.innerText || "").trim().length > 40) { el = e; break; } }
        if (!el) return { answerText: "", citations: [] };
        const links = Array.from(el.querySelectorAll('a[href^="http"]')).map((a) => a.href)
          .filter((h) => !/google\.|gstatic|youtube\.com\/(redirect|results)|accounts\.|webcache/i.test(h));
        return { answerText: String(el.innerText || "").slice(0, 8000), citations: [...new Set(links)].slice(0, 30) };
      });
      return { engine: cfg.name, prompt, answerText, citations };
    }

    // Ephemeral entry point (ChatGPT Temporary Chat etc.) → no history / no memory.
    await page.goto(cfg.ephemeralUrl || cfg.url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1200); // brief SPA hydration; composer.waitFor handles readiness

    // Login-wall detection (calibration point): if the composer never appears,
    // the session has expired → caller should refresh that engine's storageState.
    // The engine selector is OR'd with a generic fallback for resilience.
    const composerSel = cfg.composerSel
      ? `${cfg.composerSel}, textarea, div[role="textbox"]`
      : 'textarea, [contenteditable="true"], div[role="textbox"]';
    const composer = page.locator(composerSel).first();
    await composer.waitFor({ state: "visible", timeout: 35000 });
    await composer.click();

    // insertText pastes the whole prompt at once (no per-key Enter) so a multi-line
    // prompt never submits early. Then submit via the SEND BUTTON (Enter often just
    // inserts a newline in these rich composers); fall back to Enter.
    await page.keyboard.insertText(prompt);
    await page.waitForTimeout(400);
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
    const answerText = await waitForStableAnswer(page, cfg);
    const citations = await page.evaluate((sel) => {
      let root = document.body;
      if (sel) { const n = document.querySelectorAll(sel); if (n.length) root = n[n.length - 1]; }
      return Array.from(root.querySelectorAll('a[href^="http"]')).map((a) => a.href)
        .filter((h) => !/(chatgpt|openai|google\.com|gemini|accounts\.|perplexity\.ai\/?$|microsoft\.com|bing\.com|copilot|claude\.ai|anthropic|gstatic)/i.test(h));
    }, cfg.answerSel);
    return { engine: cfg.name, prompt, answerText, citations: [...new Set(citations)].slice(0, 30) };
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
async function askEngine(browser, engineKey, prompt, storageState, proxyCountry = "in") {
  const cfg = ENGINES[engineKey];
  if (!cfg) throw new Error(`Unknown engine: ${engineKey}`);
  if (cfg.needsSession && !storageState) throw new Error(`${cfg.name}: no logged-in session provided (needs storageState).`);
  const context = await browser.newContext({
    storageState: storageState || undefined,
    locale: "en-US",
    timezoneId: _TZ_FOR[String(proxyCountry || "in").toLowerCase()] || "Asia/Kolkata",
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  });
  // No-login engine → guarantee a clean, logged-out, un-personalised session every query.
  if (!storageState) { try { await context.clearCookies(); } catch {} }
  try { return await askInContext(context, cfg, prompt); }
  finally { await context.close().catch(() => {}); }
}

// ── API adapter: Claude via Anthropic SDK + web_search tool ──────────────────
// Live web access → Claude can actually verify marketplace presence and cite real
// URLs (not hallucinate). No browser, no session — just the API key.
async function askClaudeAPI(prompt) {
  let Anthropic;
  try { ({ default: Anthropic } = await import("@anthropic-ai/sdk")); }
  catch { throw new Error("@anthropic-ai/sdk not installed — required for the Claude engine."); }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set — required for the Claude engine.");
  const model = process.env.GEO_CLAUDE_MODEL || process.env.CLAUDE_MODEL || "claude-sonnet-4-6";
  const client = new Anthropic({ apiKey, timeout: 60000 });

  const resp = await client.messages.create({
    model,
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
    // Server-side web search → real, current, citable answers.
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
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
  return {
    engine: ENGINES.claude.name, prompt,
    answerText: answerText.slice(0, 8000),
    citations: [...new Set([...citations, ...bare])]
      .filter((h) => !/anthropic|claude\.ai/i.test(h)).slice(0, 30),
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
async function _runBrowserless({ engineKeys, prompts, sessions, proxyCountry }) {
  const responses = [];
  const attempts = Number(process.env.GEO_QUERY_ATTEMPTS || 1); // frugal: no retry by default (saves units)
  for (const ek of engineKeys) {
    const cfg = ENGINES[ek];
    for (const p of prompts) {
      const tag = { brand: p.brand, theme: p.theme, promptId: p.id };
      let lastErr = null;
      for (let a = 0; a < attempts; a++) {
        let browser;
        try {
          browser = await connectBrowserless(proxyCountry);
          responses.push({ ...(await askEngine(browser, ek, p.prompt, sessions[ek], proxyCountry)), ...tag });
          lastErr = null;
          break; // success
        } catch (err) { lastErr = err; }
        finally { try { await browser?.close(); } catch {} }
      }
      if (lastErr) responses.push({ engine: cfg?.name || ek, prompt: p.prompt, ...tag, error: String(lastErr?.message || lastErr) });
    }
  }
  return responses;
}

// ── Transport: LOCAL persistent profiles (.geo-sessions/profile-<engine>) ────
// Reuses the real Chrome profiles captured by scripts/geo-capture.mjs — already
// logged in and Cloudflare-cleared. One window per engine, reused across prompts.
async function _runLocal({ engineKeys, prompts }) {
  let chromium;
  try { ({ chromium } = await import("playwright")); }
  catch { throw new Error("playwright (full) not installed — run `npm i -D playwright && npx playwright install chromium` for the local GEO scan."); }
  const path = await import("path");
  const fs = await import("fs");
  const responses = [];
  for (const ek of engineKeys) {
    const cfg = ENGINES[ek];
    if (!cfg) continue;
    const profileDir = path.join(".geo-sessions", `profile-${ek}`);
    const tagFor = (p) => ({ engine: cfg.name, prompt: p.prompt, brand: p.brand, theme: p.theme, promptId: p.id });
    if (cfg.needsSession && !fs.existsSync(profileDir)) {
      for (const p of prompts) responses.push({ ...tagFor(p), error: `no local profile (.geo-sessions/profile-${ek}) — run: node scripts/geo-capture.mjs ${ek}` });
      continue;
    }
    fs.mkdirSync(profileDir, { recursive: true });
    let context;
    try {
      context = await chromium.launchPersistentContext(profileDir, {
        headless: false, channel: "chrome", viewport: null, locale: "en-US",
        args: ["--disable-blink-features=AutomationControlled", "--start-maximized"],
      });
      await context.addInitScript(() => { Object.defineProperty(navigator, "webdriver", { get: () => undefined }); });
      for (const p of prompts) {
        try { responses.push({ ...(await askInContext(context, cfg, p.prompt)), brand: p.brand, theme: p.theme, promptId: p.id }); }
        catch (err) { responses.push({ ...tagFor(p), error: String(err?.message || err) }); }
      }
    } catch (err) {
      for (const p of prompts) responses.push({ ...tagFor(p), error: String(err?.message || err) });
    } finally { try { await context?.close(); } catch {} }
  }
  return responses;
}

// ── Transport: API engines (Claude) — no browser ────────────────────────────
async function _runApi({ engineKeys, prompts }) {
  const responses = [];
  for (const ek of engineKeys) {
    const cfg = ENGINES[ek];
    for (const p of prompts) {
      const tag = { brand: p.brand, theme: p.theme, promptId: p.id };
      try {
        if (ek === "claude") responses.push({ ...(await askClaudeAPI(p.prompt)), ...tag });
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
async function _runPrompts({ mode, transport, engineKeys, prompts, sessions, proxyCountry, brandSet }) {
  if (mode !== "live") return mockResponses({ brandSet, prompts, engineKeys });
  const apiKeys = engineKeys.filter((k) => ENGINES[k]?.type === "api");
  const browserKeys = engineKeys.filter((k) => ENGINES[k] && ENGINES[k].type !== "api");
  const out = [];
  if (apiKeys.length) out.push(...(await _runApi({ engineKeys: apiKeys, prompts })));
  if (browserKeys.length) {
    out.push(...(transport === "local"
      ? await _runLocal({ engineKeys: browserKeys, prompts })
      : await _runBrowserless({ engineKeys: browserKeys, prompts, sessions, proxyCountry })));
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
    engineKeys = ["chatgpt", "gemini", "aioverviews", "perplexity", "claude"],
    sessions = {},          // { chatgpt: storageState, gemini: ..., ... }
    prompts: customPrompts,
  } = opts;

  if (!brand) throw new Error("runGeoScan: `brand` is required.");
  const brandSet = [brand, ...competitors].filter(Boolean);
  const prompts = customPrompts || buildGeoPrompts({ brand, industry, marketplaces, location });

  const responses = await _runPrompts({ mode, transport, engineKeys, prompts, sessions, proxyCountry, brandSet });

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
    engineKeys = ["chatgpt", "gemini", "aioverviews", "perplexity", "claude"],
    sessions = {},
  } = opts;

  const brand = client || opts.brand;
  if (!brand) throw new Error("runMarketplaceScan: `client` (brand) is required.");
  const mps = marketplaces && marketplaces.length ? marketplaces : MARKETPLACES;
  const site = clientSite || clientDomain;
  const prompts = buildMarketplacePrompts({ client: brand, clientSite: site, competitors, marketplaces: mps });
  const brandSet = [brand, ...competitors.map((c) => (typeof c === "string" ? c : c.name))].filter(Boolean);

  const responses = await _runPrompts({ mode, transport, engineKeys, prompts, sessions, proxyCountry, brandSet });

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
