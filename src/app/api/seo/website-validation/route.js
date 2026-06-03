// src/app/api/seo/website-validation/route.js
// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 1 — WEBSITE VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════
// The first gate of the enterprise flow. Confirms the domain is real, reachable,
// secured, and correctly configured before any data collection begins.
// Checks: Domain Validation, SSL Verification, DNS Validation, Redirect Analysis,
// Canonical Detection.
// ═══════════════════════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { lookup } from "dns/promises";

export const runtime    = "nodejs";
export const maxDuration = 30;

const TIMEOUT_MS = 10000;

function normHost(input) {
  try {
    const s = String(input || "").trim();
    const u = s.includes("://") ? new URL(s) : new URL(`https://${s}`);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return String(input || "").replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  }
}

async function timedFetch(url, opts = {}) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeout || TIMEOUT_MS);
  try {
    return await fetch(url, {
      redirect: "manual",
      ...opts,
      signal: ctrl.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; DrFizz/2.0; +https://drfizz.com)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        ...opts.headers,
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function validateWebsite(domain) {
  const host = normHost(domain);
  const result = {
    domain: host,
    valid: false,
    checks: {
      domainValidation:   { pass: false, detail: "" },
      sslVerification:    { pass: false, detail: "" },
      dnsValidation:      { pass: false, detail: "" },
      redirectAnalysis:   { pass: true,  detail: "", chain: [] },
      canonicalDetection: { pass: false, detail: "", canonical: null },
    },
    finalUrl: null,
    issues: [],
  };

  // ── 1. Domain format validation ──
  const domainRe = /^([a-z0-9-]+\.)+[a-z]{2,}$/i;
  if (domainRe.test(host)) {
    result.checks.domainValidation = { pass: true, detail: `Valid domain format: ${host}` };
  } else {
    result.checks.domainValidation = { pass: false, detail: `Invalid domain format: ${host}` };
    result.issues.push("Domain format is invalid");
  }

  // ── 2. DNS validation (does it resolve?) ──
  try {
    const addr = await lookup(host);
    result.checks.dnsValidation = { pass: true, detail: `Resolves to ${addr.address}` };
  } catch {
    result.checks.dnsValidation = { pass: false, detail: "Domain does not resolve (no DNS A record)" };
    result.issues.push("DNS does not resolve");
  }

  // ── 3. SSL verification + 4. Redirect analysis (follow the chain manually) ──
  let currentUrl = `https://${host}`;
  const chain = [];
  let sslOk = false;
  let finalHtml = "";
  let finalUrl = currentUrl;

  for (let hop = 0; hop < 6; hop++) {
    let res;
    try {
      res = await timedFetch(currentUrl);
    } catch (err) {
      // If https failed on the first hop, SSL/connectivity problem
      if (hop === 0) {
        result.checks.sslVerification = { pass: false, detail: `HTTPS request failed: ${err?.message || "connection error"}` };
        result.issues.push("SSL/HTTPS connection failed");
      }
      break;
    }

    // First successful https response → SSL is working
    if (hop === 0 && currentUrl.startsWith("https://")) {
      sslOk = true;
    }

    const status = res.status;
    if (status >= 300 && status < 400) {
      const loc = res.headers.get("location");
      if (!loc) break;
      const nextUrl = new URL(loc, currentUrl).href;
      chain.push({ from: currentUrl, to: nextUrl, status });
      currentUrl = nextUrl;
      finalUrl = nextUrl;
      continue;
    }

    // Final (non-redirect) response
    finalUrl = currentUrl;
    if (status >= 200 && status < 300) {
      try { finalHtml = await res.text(); } catch { finalHtml = ""; }
    }
    break;
  }

  result.finalUrl = finalUrl;
  result.checks.sslVerification = sslOk
    ? { pass: true, detail: "Valid SSL — HTTPS responds" }
    : (result.checks.sslVerification.detail
        ? result.checks.sslVerification
        : { pass: false, detail: "HTTPS did not respond" });
  if (!sslOk && !result.issues.includes("SSL/HTTPS connection failed")) result.issues.push("SSL/HTTPS not verified");

  // Redirect analysis
  const redirectLoop = detectLoop(chain);
  result.checks.redirectAnalysis = {
    pass: !redirectLoop && chain.length <= 3,
    detail: chain.length === 0
      ? "No redirects — direct 200 response"
      : redirectLoop
        ? "Redirect loop detected"
        : `${chain.length} redirect hop(s): ${chain.map(c => `${new URL(c.from).protocol}//…→${c.status}`).join(" ")}`,
    chain,
  };
  if (redirectLoop) result.issues.push("Redirect loop detected");
  if (chain.length > 3) result.issues.push(`Long redirect chain (${chain.length} hops)`);

  // ── 5. Canonical detection (from final HTML) ──
  if (finalHtml) {
    const canonical =
      first(finalHtml, /<link\s[^>]*rel=["']canonical["'][^>]*href=["']([^"']*)["']/i) ||
      first(finalHtml, /<link\s[^>]*href=["']([^"']*)["'][^>]*rel=["']canonical["']/i);
    if (canonical) {
      result.checks.canonicalDetection = { pass: true, detail: `Canonical present`, canonical };
    } else {
      result.checks.canonicalDetection = { pass: false, detail: "No canonical tag on homepage", canonical: null };
      result.issues.push("Homepage missing canonical tag");
    }
  } else {
    result.checks.canonicalDetection = { pass: false, detail: "Could not read homepage HTML", canonical: null };
  }

  // Overall validity: domain + DNS + SSL must pass (canonical/redirect are warnings)
  result.valid =
    result.checks.domainValidation.pass &&
    result.checks.dnsValidation.pass &&
    result.checks.sslVerification.pass;

  return result;
}

function detectLoop(chain) {
  const seen = new Set();
  for (const hop of chain) {
    if (seen.has(hop.to)) return true;
    seen.add(hop.to);
  }
  return false;
}

const first = (html, re) => { const m = html.match(re); return m?.[1]?.trim() || null; };

export async function POST(request) {
  try {
    const { domain } = await request.json();
    if (!domain) return NextResponse.json({ error: "domain required" }, { status: 400 });
    const result = await validateWebsite(domain);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[website-validation] Error:", err);
    return NextResponse.json({ error: err?.message || "validation failed" }, { status: 500 });
  }
}
