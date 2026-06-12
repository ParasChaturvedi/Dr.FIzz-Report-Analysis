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

export const ENGINES = {
  chatgpt:     { name: "ChatGPT",             url: "https://chatgpt.com/",           needsSession: true,  type: "chat" },
  gemini:      { name: "Gemini",              url: "https://gemini.google.com/app",  needsSession: true,  type: "chat" },
  // Google AI Overviews = the AI summary on the Google SEARCH results page (NOT
  // the Gemini app). No login required; reuses the Google session if present.
  aioverviews: { name: "Google AI Overviews", url: "https://www.google.com/search",  needsSession: false, type: "search" },
  perplexity:  { name: "Perplexity",          url: "https://www.perplexity.ai/",     needsSession: false, type: "chat" },
  copilot:     { name: "Microsoft Copilot",   url: "https://copilot.microsoft.com/", needsSession: true,  type: "chat" },
  claude:      { name: "Claude",              url: "https://claude.ai/new",          needsSession: true,  type: "chat" },
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
  const ws = `${base}/chromium/playwright?token=${encodeURIComponent(token)}${proxyQs}`;
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
const SETTLE_MS = Number(process.env.GEO_SCAN_SETTLE_MS || 9000);
async function askEngine(browser, engineKey, prompt, storageState) {
  const cfg = ENGINES[engineKey];
  if (!cfg) throw new Error(`Unknown engine: ${engineKey}`);
  if (cfg.needsSession && !storageState) throw new Error(`${cfg.name}: no logged-in session provided (needs storageState).`);

  const context = await browser.newContext({
    storageState: storageState || undefined,
    locale: "en-US",
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  });
  const page = await context.newPage();
  try {
    // ── Search-type engine (Google AI Overviews): run a Google search and grab
    //    the AI Overview block + its source links. No chat composer. ──
    if (cfg.type === "search") {
      const country = (process.env.BROWSERLESS_PROXY_COUNTRY || "in").toLowerCase();
      await page.goto(`${cfg.url}?q=${encodeURIComponent(prompt)}&gl=${country}&hl=en&num=10`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(5000);
      try { await page.getByRole("button", { name: /show more/i }).first().click({ timeout: 2500 }); await page.waitForTimeout(1500); } catch {}
      const answerText = await page.evaluate(() => {
        const el = document.querySelector('[data-attrid*="AIOverview" i], [aria-label*="AI Overview" i], #rso');
        return (el?.innerText || document.body.innerText).slice(0, 8000);
      });
      const citations = await page.evaluate(() =>
        Array.from(document.querySelectorAll('a[href^="http"]')).map((a) => a.href)
          .filter((h) => !/google\.|gstatic|youtube\.com\/(redirect|results)|accounts\.|webcache/i.test(h))
      );
      return { engine: cfg.name, prompt, answerText, citations: [...new Set(citations)].slice(0, 30) };
    }

    await page.goto(cfg.url, { waitUntil: "domcontentloaded", timeout: 60000 });

    // Login-wall detection (calibration point): if the composer never appears,
    // the session has expired → caller should refresh that engine's storageState.
    const composer = page.locator('textarea, [contenteditable="true"], div[role="textbox"]').first();
    await composer.waitFor({ state: "visible", timeout: 25000 });

    await composer.click();
    await composer.type(prompt, { delay: 20 });
    await page.keyboard.press("Enter");

    // Wait for streaming to settle. (Calibration point: per-engine "stop
    // generating" disappearance is more precise than a fixed wait.)
    await page.waitForTimeout(SETTLE_MS);

    const answerText = await page.evaluate(() => document.body.innerText.slice(-8000));
    const citations = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a[href^="http"]'))
        .map((a) => a.href)
        .filter((h) => !/(chatgpt|openai|google\.com|gemini|accounts\.|perplexity\.ai\/?$|microsoft\.com|bing\.com|copilot|claude\.ai|anthropic)/i.test(h))
    );
    return { engine: cfg.name, prompt, answerText, citations: [...new Set(citations)].slice(0, 30) };
  } finally {
    await context.close();
  }
}

// ── Mock adapter (no browser — testable now) ─────────────────────────────────
function mockResponses({ brandSet, prompts, engineKeys }) {
  const lead = brandSet[1] || brandSet[0]; // a competitor leads, client trails (realistic)
  const out = [];
  for (const ek of engineKeys) {
    const eName = ENGINES[ek]?.name || ek;
    for (const p of prompts) {
      out.push({
        engine: eName,
        prompt: p.prompt,
        brandsMentioned: brandSet.slice(0, Math.min(3, brandSet.length)),
        leadBrand: lead,
        citations: ["https://idntimes.com/x", "https://clutch.co/y", "https://reddit.com/z"],
      });
    }
  }
  return out;
}

// ── Orchestrator ─────────────────────────────────────────────────────────────
export async function runGeoScan(opts = {}) {
  const {
    mode = "mock",
    brand,
    clientDomain = "",
    competitors = [],
    competitorDomains = [],
    industry = "",
    marketplaces = [],
    location = "",
    proxyCountry = "in",    // residential-IP country (matches the report's market)
    engineKeys = ["chatgpt", "gemini", "aioverviews", "perplexity", "copilot"],
    sessions = {},          // { chatgpt: storageState, gemini: ..., ... }
    prompts: customPrompts,
  } = opts;

  if (!brand) throw new Error("runGeoScan: `brand` is required.");
  const brandSet = [brand, ...competitors].filter(Boolean);
  const prompts = customPrompts || buildGeoPrompts({ brand, industry, marketplaces, location });

  let responses = [];
  if (mode === "live") {
    const browser = await connectBrowserless(proxyCountry);
    try {
      for (const ek of engineKeys) {
        for (const p of prompts) {
          try {
            responses.push(await askEngine(browser, ek, p.prompt, sessions[ek]));
          } catch (err) {
            responses.push({ engine: ENGINES[ek]?.name || ek, prompt: p.prompt, error: String(err?.message || err) });
          }
        }
      }
    } finally {
      try { await browser.close(); } catch {}
    }
  } else {
    responses = mockResponses({ brandSet, prompts, engineKeys });
  }

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
