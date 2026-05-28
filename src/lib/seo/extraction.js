// src/lib/seo/extraction.js
import { extractPageText } from "@/lib/seo/apyhub";

// ✅ MAIN-CONTENT extraction (Readability)
import { JSDOM, VirtualConsole } from "jsdom";
import { Readability } from "@mozilla/readability";

// ---------------------------
// Small helpers
// ---------------------------
export function safeTrim(s, max = 140) {
  const x = (s || "").toString().trim();
  if (!x) return "";
  return x.length > max ? x.slice(0, max - 1) + "…" : x;
}

export function decodeHtmlEntities(str = "") {
  return String(str)
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ");
}

function htmlTextLen(html = "") {
  const text = String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length;
}

function getBrowserlessBase() {
  return (
    process.env.BROWSERLESS_ENDPOINT_BASE || "https://production-sfo.browserless.io"
  );
}

function withResidentialProxyIfEnabled(url) {
  const useRes = String(process.env.BROWSERLESS_USE_RESIDENTIAL || "").trim() === "1";
  return useRes ? `${url}&proxy=residential` : url;
}

/* -------------------------------------------
   ✅ GLOBAL BROWSERLESS CONCURRENCY LIMITER
   Prevents 429 "Too Many Requests" on Browserless.
-------------------------------------------- */

const MAX_BROWSERLESS_CONCURRENCY = Number(
  process.env.BROWSERLESS_MAX_CONCURRENCY || 1
);

let browserlessActive = 0;
const browserlessQueue = [];

async function acquireBrowserlessSlot() {
  const max = Number.isFinite(MAX_BROWSERLESS_CONCURRENCY)
    ? Math.max(1, MAX_BROWSERLESS_CONCURRENCY)
    : 1;

  if (browserlessActive < max) {
    browserlessActive += 1;
    return () => {
      browserlessActive = Math.max(0, browserlessActive - 1);
      const next = browserlessQueue.shift();
      if (next) next();
    };
  }

  return new Promise((resolve) => {
    browserlessQueue.push(() => {
      browserlessActive += 1;
      resolve(() => {
        browserlessActive = Math.max(0, browserlessActive - 1);
        const next = browserlessQueue.shift();
        if (next) next();
      });
    });
  });
}

/* -------------------------------------------
   ✅ Direct fetch fallback (fast / no Browserless)
-------------------------------------------- */

async function fetchHtmlDirect(url, { timeoutMs = 15000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "user-agent": "DoctorFizzBot/1.0",
        accept: "text/html,application/xhtml+xml",
      },
    });

    if (!res.ok) return { ok: false, status: res.status, html: "" };
    const html = await res.text().catch(() => "");
    return { ok: true, status: res.status, html: html || "" };
  } catch {
    return { ok: false, status: 0, html: "" };
  } finally {
    clearTimeout(t);
  }
}

/**
 * ✅ REAL browser rendering via Browserless (Vercel-friendly)
 * Strategy:
 * 1) Try /content with wait+scroll for JS + lazy-load pages.
 * 2) If response is still too "thin", retry via /unblock (anti-bot) with content: true.
 *
 * ✅ NEW:
 * - global concurrency cap (default 1)
 * - if Browserless returns 429 -> fallback to direct fetch
 */
export async function fetchHtml(url) {
  const token = process.env.BROWSERLESS_TOKEN;
  if (!token) throw new Error("Missing BROWSERLESS_TOKEN env variable");

  const release = await acquireBrowserlessSlot();
  try {
    const base = getBrowserlessBase();

    // ---------- 1) /content (fast path) ----------
    const contentEndpoint = withResidentialProxyIfEnabled(
      `${base}/content?token=${token}`
    );

    const contentPayload = {
      url,
      gotoOptions: { waitUntil: "domcontentloaded", timeout: 45000 },
      rejectResourceTypes: ["image", "font", "media"],
      bestAttempt: true,
      waitForFunction: {
        timeout: 45000,
        fn: `
          async () => {
            const sleep = (ms) => new Promise(r => setTimeout(r, ms));
            await sleep(1200);

            let lastH = -1;
            for (let i = 0; i < 12; i++) {
              window.scrollTo(0, document.body.scrollHeight);
              await sleep(650);
              const h = document.body.scrollHeight;
              if (h === lastH) break;
              lastH = h;
            }

            await sleep(600);

            const textLen = (document.body.innerText || "").trim().length;
            const hasMain =
              document.querySelector("article") ||
              document.querySelector("[itemprop='articleBody']") ||
              document.querySelector(".entry-content") ||
              document.querySelector(".post-content") ||
              document.querySelector(".blog-content") ||
              document.querySelector("main");

            return Boolean(hasMain) && textLen > 1200;
          }
        `,
      },
    };

    let html = "";
    let res;

    try {
      res = await fetch(contentEndpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cache-control": "no-cache",
        },
        body: JSON.stringify(contentPayload),
      });
    } catch {
      res = null;
    }

    // ✅ 429 => fallback immediately (don’t hammer Browserless)
    if (res && res.status === 429) {
      const direct = await fetchHtmlDirect(url, { timeoutMs: 15000 });
      return { ok: direct.ok, status: direct.status || 200, html: direct.html, finalUrl: url, headers: {} };
    }

    if (res?.ok) {
      html = await res.text().catch(() => "");
    } else {
      html = "";
    }

    if (html && htmlTextLen(html) > 1500) {
      return { ok: true, status: 200, html, finalUrl: url, headers: {} };
    }

    // ---------- 2) /unblock (anti-bot path) ----------
    const unblockEndpoint = withResidentialProxyIfEnabled(
      `${base}/unblock?token=${token}`
    );

    const unblockPayload = {
      url,
      content: true,
      cookies: false,
      browserWSEndpoint: false,
      bestAttempt: true,
    };

    const res2 = await fetch(unblockEndpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "cache-control": "no-cache",
      },
      body: JSON.stringify(unblockPayload),
    });

    // ✅ 429 => fallback immediately
    if (res2.status === 429) {
      const direct = await fetchHtmlDirect(url, { timeoutMs: 15000 });
      return { ok: direct.ok, status: direct.status || 200, html: direct.html, finalUrl: url, headers: {} };
    }

    if (!res2.ok) {
      const t = await res2.text().catch(() => "");
      // Fallback to direct fetch rather than failing the whole scan
      const direct = await fetchHtmlDirect(url, { timeoutMs: 15000 });
      if (direct.ok && direct.html) {
        return { ok: true, status: 200, html: direct.html, finalUrl: url, headers: {} };
      }
      throw new Error(
        `Browserless /unblock failed (${res2.status}): ${t.slice(0, 250)}`
      );
    }

    const json = await res2.json().catch(() => ({}));
    const unblockHtml =
      typeof json?.content === "string"
        ? json.content
        : typeof json?.html === "string"
        ? json.html
        : "";

    if (unblockHtml && htmlTextLen(unblockHtml) > 800) {
      return {
        ok: true,
        status: 200,
        html: unblockHtml || "",
        finalUrl: url,
        headers: {},
      };
    }

    // If unblock returns thin HTML, still fallback to direct fetch
    const direct = await fetchHtmlDirect(url, { timeoutMs: 15000 });
    return {
      ok: direct.ok,
      status: direct.status || 200,
      html: direct.html || unblockHtml || "",
      finalUrl: url,
      headers: {},
    };
  } finally {
    release();
  }
}

export function extractTitle(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return "";
  return decodeHtmlEntities(m[1].replace(/\s+/g, " ").trim());
}

export function extractMetaDescription(html) {
  const m = html.match(
    /<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i
  );
  if (!m) return "";
  return decodeHtmlEntities(m[1].replace(/\s+/g, " ").trim());
}

/* -------------------------------------------
   ✅ Helpers for Readability fallback
-------------------------------------------- */

function stripStylesAndStylesheets(html = "") {
  const s = String(html || "");
  if (!s) return "";
  return (
    s
      // remove <style> blocks
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      // remove stylesheet links
      .replace(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi, "")
      // sometimes rel=preload as=style
      .replace(/<link[^>]+as=["']style["'][^>]*>/gi, "")
  );
}

function extractTagInner(html, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = String(html || "").match(re);
  return m ? m[1] : "";
}

/**
 * ✅ MAIN-CONTENT extraction using Mozilla Readability.
 *
 * Improvements:
 * - strip CSS before JSDOM (stops "Could not parse CSS stylesheet" spam)
 * - VirtualConsole to silence noisy jsdom errors
 * - fallback to <main>/<article> if Readability fails
 */
export function extractMainContentHtml(fullHtml, url = "https://example.com") {
  try {
    const raw = String(fullHtml || "");
    if (!raw) return { title: "", contentHtml: "", text: "", excerpt: "", length: 0 };

    // ✅ stop CSS parse spam + reduce jsdom work
    const html = stripStylesAndStylesheets(raw);

    const vc = new VirtualConsole();
    // swallow jsdom CSS/parse errors; keep your logs clean
    vc.on("error", () => {});
    vc.on("jsdomError", () => {});

    const dom = new JSDOM(html, {
      url,
      virtualConsole: vc,
      pretendToBeVisual: true,
    });

    const doc = dom.window.document;

    // Remove obvious noise before parsing
    doc.querySelectorAll(
      "header, nav, footer, aside, form, script, noscript, iframe, canvas, svg"
    ).forEach((n) => n.remove());

    // Also remove common “chrome” containers if present
    doc.querySelectorAll(
      "[role='navigation'], [role='banner'], [role='contentinfo'], .navbar, .nav, .header, .footer, .sidebar"
    ).forEach((n) => n.remove());

    const reader = new Readability(doc, { keepClasses: false });
    const article = reader.parse();

    const contentHtml = String(article?.content || "").trim();
    const text = String(article?.textContent || "").trim();

    if (contentHtml && text.length >= 300) {
      return {
        title: String(article?.title || "").trim(),
        contentHtml,
        text,
        excerpt: String(article?.excerpt || "").trim(),
        length: Number(article?.length || text.length || 0) || 0,
      };
    }

    // ✅ Fallback: if Readability fails, take <main> or <article> inner HTML
    const mainInner =
      extractTagInner(html, "main") ||
      extractTagInner(html, "article") ||
      "";

    if (mainInner && mainInner.trim().length > 500) {
      const textLen = mainInner
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim().length;

      if (textLen >= 300) {
        return {
          title: "",
          contentHtml: mainInner.trim(),
          text: "",
          excerpt: "",
          length: textLen,
        };
      }
    }

    // fail
    return { title: "", contentHtml: "", text: "", excerpt: "", length: 0 };
  } catch {
    return { title: "", contentHtml: "", text: "", excerpt: "", length: 0 };
  }
}

/**
 * Build the same “card” you currently return from /opportunities.
 * Returns: { url, title, description, wordCount }
 */
export async function buildOpportunityCard(url) {
  let html = "";
  let title = "";
  let description = "";

  try {
    const fetched = await fetchHtml(url);
    html = fetched.html || "";
    title = extractTitle(html);
    description = extractMetaDescription(html);
  } catch {
    // ignore
  }

  let wordCount = 0;
  try {
    const extracted = await extractPageText(url);
    const text = extracted?.apyhub?.text || "";
    wordCount = text ? text.trim().split(/\s+/).filter(Boolean).length : 0;
  } catch {
    wordCount = 0;
  }

  const fallbackFromPath =
    decodeHtmlEntities(
      new URL(url).pathname
        .split("/")
        .filter(Boolean)
        .slice(-1)[0]
        ?.replace(/[-_]/g, " ")
        ?.trim() || ""
    ) || "Untitled";

  const cleanTitle = title || fallbackFromPath;

  return {
    url,
    title: safeTrim(cleanTitle, 70),
    description: safeTrim(description || "", 110),
    wordCount,
  };
}

/**
 * Used by scan-draft job.
 * Returns: { title, description, wordCount }
 */
export async function extractSeoData(url) {
  let html = "";
  let title = "";
  let description = "";

  try {
    const fetched = await fetchHtml(url);
    html = fetched.html || "";
    title = extractTitle(html);
    description = extractMetaDescription(html);
  } catch {
    // ignore
  }

  let wordCount = 0;
  try {
    const extracted = await extractPageText(url);
    const text = extracted?.apyhub?.text || "";
    wordCount = text ? text.trim().split(/\s+/).filter(Boolean).length : 0;
  } catch {
    wordCount = 0;
  }

  return {
    title: safeTrim(title || "", 70),
    description: safeTrim(description || "", 110),
    wordCount,
  };
}
