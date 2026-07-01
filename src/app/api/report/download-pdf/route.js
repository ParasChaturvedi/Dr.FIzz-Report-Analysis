/**
 * POST /api/report/download-pdf
 *
 * Self-hosted HTML → PDF using headless Chromium (Puppeteer). The browser
 * inlines all CSS and sends a fully self-contained HTML document; we render it
 * with Chrome's native "Print to PDF" engine. This produces a real VECTOR PDF —
 * selectable, searchable text, small file size, exact fidelity, and it honours
 * the report's @media print CSS (page numbers, page breaks).
 *
 *   • Local dev  → uses the locally-installed Google Chrome.
 *   • Vercel/AWS → uses @sparticuz/chromium (a Lambda-sized Chromium build).
 *
 * No third-party conversion service. If Chromium can't launch (e.g. missing libs
 * on a serverless host), this returns 502 and the client falls back to its own
 * in-browser per-slide render (DownloadReportModal.generateDeckClientSide).
 *
 * Body: { htmlContent: string, domain?: string, deck?: boolean }
 * Returns: application/pdf binary stream
 */

import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

export const runtime     = "nodejs";
export const maxDuration = 60;

// Detect a serverless (Vercel/AWS Lambda) environment.
function isServerless() {
  return !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.AWS_EXECUTION_ENV);
}

// Resolve a local Chrome/Chromium executable for dev environments.
function localChromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",       // macOS
    "/Applications/Chromium.app/Contents/MacOS/Chromium",                 // macOS Chromium
    "/usr/bin/google-chrome",                                            // Linux
    "/usr/bin/chromium-browser",                                         // Linux
    "/usr/bin/chromium",                                                 // Linux
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",        // Windows
  ].filter(Boolean);
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require("fs");
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p; } catch { /* ignore */ }
  }
  return null;
}

async function launchBrowser() {
  if (isServerless()) {
    return puppeteer.launch({
      args: [...chromium.args, "--no-sandbox", "--disable-setuid-sandbox"],
      defaultViewport: { width: 1280, height: 1696, deviceScaleFactor: 2 },
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
  }
  // Local dev — use installed Chrome
  const execPath = localChromePath();
  if (!execPath) throw new Error("No local Chrome found. Set CHROME_PATH or install Google Chrome.");
  return puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    defaultViewport: { width: 1280, height: 1696, deviceScaleFactor: 2 },
    executablePath: execPath,
    headless: true,
  });
}

// ── Render the self-contained HTML with headless Chromium ─────────────────────
async function renderWithChromium(htmlContent, deck = false) {
  let browser = null;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    // Deck = fixed 1280×720 16:9 slides; render at slide width so layout is exact.
    await page.setViewport({ width: 1280, height: deck ? 720 : 1696, deviceScaleFactor: 2 });

    // Load the fully self-contained HTML. networkidle0 waits for fonts/images.
    await page.setContent(htmlContent, { waitUntil: "networkidle0", timeout: 45000 });
    // Ensure web fonts have settled before printing.
    try { await page.evaluateHandle("document.fonts.ready"); } catch { /* ignore */ }
    await page.emulateMediaType("print");

    const pdf = await page.pdf({
      // Deck: one 1280×720 landscape page PER slide (slides carry page-break-after).
      // Legacy report: A4 portrait flow.
      ...(deck ? { width: "1280px", height: "720px" } : { format: "A4" }),
      printBackground: true,
      preferCSSPageSize: false,
      margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" },
      displayHeaderFooter: false,
    });
    return Buffer.from(pdf);
  } finally {
    if (browser) { try { await browser.close(); } catch { /* ignore */ } }
  }
}

export async function POST(req) {
  try {
    const { htmlContent, domain, deck = false } = await req.json();

    // Self-hosted Chromium only. No ConvertAPI. If Chromium can't render, return a
    // 502 so the client falls back to its own in-browser per-slide render.
    if (!htmlContent) {
      return Response.json({ error: "htmlContent is required." }, { status: 400 });
    }

    let pdfBuffer = null;
    try {
      pdfBuffer = await renderWithChromium(htmlContent, deck);
    } catch (chromeErr) {
      console.error("[download-pdf] Chromium failed:", chromeErr?.message);
      return Response.json({ error: "Chromium render failed; use client fallback." }, { status: 502 });
    }

    if (!pdfBuffer || pdfBuffer.byteLength < 1000) {
      return Response.json({ error: "PDF generation produced an empty file." }, { status: 502 });
    }

    const safeDomain = (domain || "report").replace(/[^a-z0-9.-]/gi, "_");
    const filename   = `ItzFizz-Report-${safeDomain}-${Date.now()}.pdf`;
    console.log(`[download-pdf] OK via chromium: ${pdfBuffer.byteLength} bytes`);

    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type":        "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length":      String(pdfBuffer.byteLength),
        "X-PDF-Engine":        "chromium",
      },
    });
  } catch (err) {
    console.error("[download-pdf] Unexpected error:", err);
    return Response.json({ error: err?.message || "Unknown error" }, { status: 500 });
  }
}
