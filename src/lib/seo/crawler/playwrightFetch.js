// src/lib/seo/crawler/playwrightFetch.js
// The Playwright fetch adapter: navigate each page in a real headless Chromium
// (Browserless hosted, or local chromium fallback), return the RENDERED HTML plus the
// raw body and the HTTP response (status, headers, redirect chain). One browser session
// is reused across the crawl; a dead session reconnects lazily. Mirrors collector.js.
// RULE 0: no em dashes or en dashes anywhere.

const DEFAULT_UA = "DoctorFizz Site Crawler";

function lc(headers) { const out = {}; for (const [k, v] of Object.entries(headers || {})) out[String(k).toLowerCase()] = v; return out; }

export async function createPlaywrightFetcher(opts = {}) {
  const proxyCountry = opts.proxyCountry || "";
  const userAgent = opts.userAgent || DEFAULT_UA;
  const waitUntil = opts.waitUntil || "domcontentloaded";
  const sessionTimeoutMs = Number(opts.sessionTimeoutMs || process.env.CRAWLER_SESSION_TIMEOUT_MS || 280000);
  const navTimeoutMs = Number(opts.navTimeoutMs || process.env.CRAWLER_NAV_TIMEOUT_MS || 35000);
  // Generous body-read cap so a slow (rate-limited) Browserless still renders each page fully
  // instead of yielding an empty body; the crawl deadline + evaluator hard cap bound the total.
  const bodyReadMs = Number(opts.bodyReadMs || process.env.CRAWLER_BODY_READ_MS || 25000);
  const useResidential = String(opts.useResidential != null ? opts.useResidential : (process.env.CRAWLER_USE_RESIDENTIAL || "")).trim() === "1";
  const raceTo = (p, ms, fallback) => Promise.race([Promise.resolve(p).catch(() => fallback), new Promise((res) => setTimeout(() => res(fallback), ms))]);

  let chromium;
  try { ({ chromium } = await import("playwright-core")); }
  catch { throw new Error("playwright-core is not installed - required for the Playwright site crawler."); }

  let browser = null; let context = null;

  async function connect() {
    const token = process.env.BROWSERLESS_TOKEN;
    if (token) {
      const base = (process.env.BROWSERLESS_ENDPOINT_BASE || "https://production-sfo.browserless.io").replace(/^http/i, "ws");
      const country = String(proxyCountry || process.env.BROWSERLESS_PROXY_COUNTRY || "").toLowerCase();
      const proxyQs = useResidential ? `&proxy=residential${country ? `&proxyCountry=${country}` : ""}` : "";
      const ws = `${base}/chromium/playwright?token=${encodeURIComponent(token)}${proxyQs}&timeout=${sessionTimeoutMs}`;
      // Bound each connect attempt so a slow/unreachable Browserless never hangs the audit.
      const connectTimeout = Number(process.env.CRAWLER_CONNECT_TIMEOUT_MS || 25000);
      const attempts = Math.max(1, Number(process.env.CRAWLER_CONNECT_ATTEMPTS || process.env.BROWSERLESS_CONNECT_ATTEMPTS) || 2);
      let lastErr;
      for (let i = 0; i < attempts; i++) {
        try { return await chromium.connect(ws, { timeout: connectTimeout }); }
        catch (e) {
          lastErr = e;
          const rateLimited = /\b429\b|too many requests|rate.?limit|session limit|concurrent|max.*sessions/i.test(String(e && e.message || ""));
          if (!rateLimited || i === attempts - 1) throw e;
          await new Promise((r) => setTimeout(r, Math.min(25000, 3000 * Math.pow(1.7, i)) + Math.floor(Math.random() * 2000)));
        }
      }
      throw lastErr;
    }
    return await chromium.launch({ headless: true });
  }

  async function getContext() {
    if (browser && typeof browser.isConnected === "function" && browser.isConnected() && context) return context;
    try { if (browser) await browser.close(); } catch { /* ignore */ }
    browser = await connect();
    context = await browser.newContext({ userAgent, ignoreHTTPSErrors: true, javaScriptEnabled: true });
    context.setDefaultNavigationTimeout(navTimeoutMs);
    return context;
  }

  async function fetchPage(url) {
    const started = Date.now();
    let page = null;
    try {
      const ctx = await getContext();
      page = await ctx.newPage();
      let response;
      try { response = await page.goto(url, { waitUntil, timeout: navTimeoutMs }); }
      catch (navErr) { return { url, status: 0, status_text: "No Response", error: String(navErr && navErr.message || navErr).slice(0, 200), response_time: (Date.now() - started) / 1000, headers: {}, redirect_chain: [], _body: "" }; }

      const status = response ? response.status() : 0;
      const headers = response ? lc(response.headers()) : {};
      const statusText = response ? (response.statusText() || "") : "";
      const finalUrl = (page.url && page.url()) || (response ? response.url() : url);

      const hops = [];
      let from = response ? response.request().redirectedFrom() : null;
      let guard = 0;
      while (from && guard < 20) {
        let hopStatus = 0;
        try { const rr = await raceTo(from.response(), 5000, null); hopStatus = rr ? rr.status() : 0; } catch { /* ignore */ }
        hops.push({ url: from.url(), status: hopStatus });
        from = from.redirectedFrom(); guard++;
      }
      hops.reverse();

      const contentType = headers["content-type"] || "";
      const isHtml = /html/i.test(contentType);
      const html = isHtml ? await raceTo(page.content(), bodyReadMs, "") : "";
      let rawBody = "";
      if (isHtml && response) rawBody = await raceTo(response.text(), bodyReadMs, "");
      const contentLength = Number(headers["content-length"]) || (html ? Buffer.byteLength(html, "utf8") : 0);

      return {
        url, final_url: finalUrl, status, status_text: statusText, content_type: contentType,
        response_time: (Date.now() - started) / 1000, content_length: contentLength,
        last_modified: headers["last-modified"] || "", redirect_chain: hops, redirected: hops.length > 0,
        headers, _body: html, _raw_body: rawBody || html,
      };
    } catch (e) {
      try { if (browser) await browser.close(); } catch { /* ignore */ }
      browser = null; context = null;
      return { url, status: 0, status_text: "No Response", error: String(e && e.message || e).slice(0, 200), response_time: (Date.now() - started) / 1000, headers: {}, redirect_chain: [], _body: "" };
    } finally { if (page) { try { await page.close(); } catch { /* ignore */ } } }
  }

  async function fetchText(u) {
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 10000);
      const res = await fetch(u, { headers: { "User-Agent": userAgent, Accept: "text/plain,*/*" }, signal: ctrl.signal, redirect: "follow" });
      clearTimeout(to);
      if (res.status === 200) return await res.text();
      return null;
    } catch { return null; }
  }

  async function close() { try { if (browser) await browser.close(); } catch { /* ignore */ } browser = null; context = null; }

  return { fetchPage, fetchText, close };
}

export default { createPlaywrightFetcher };
