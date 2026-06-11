// src/app/api/plagiarism/route.js
import { NextResponse } from "next/server";
import { checkPlagiarismWithClaude } from "@/lib/claude/pipeline";

export const runtime = "nodejs";

function clampPct(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(100, Math.round(x)));
}

function htmlToPlain(html) {
  const s = String(html || "");
  if (!s) return "";
  return s
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateForModel(text, maxChars = 9000) {
  const s = String(text || "");
  if (!s) return "";
  return s.length > maxChars ? s.slice(0, maxChars) : s;
}

/**
 * POST body:
 * {
 *   url?: string,                // page url (helps Claude AI verify sources)
 *   draftHtml?: string,          // current editor HTML
 *   draftText?: string,          // optional (if you already have plain text)
 *   sourceUrl?: string,          // imported page url (optional but recommended)
 *   sourceHtml?: string,         // imported html (optional)
 *   sourceText?: string          // imported plain text (optional)
 * }
 *
 * Response:
 * {
 *   plagiarism: number (0..100),
 *   sources: [{ url, note }] (optional),
 *   checkedAt: iso,
 *   cacheKey: string
 * }
 */
export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));

    const url = String(body?.url || "").trim();
    const sourceUrl = String(body?.sourceUrl || "").trim();

    const draftText =
      String(body?.draftText || "").trim() ||
      htmlToPlain(body?.draftHtml);

    const sourceText =
      String(body?.sourceText || "").trim() ||
      htmlToPlain(body?.sourceHtml);

    if (!draftText) {
      return NextResponse.json(
        { error: "draftHtml/draftText is required" },
        { status: 400 }
      );
    }

    // Keep model input bounded
    const draftForModel = truncateForModel(draftText, 9000);
    const sourceForModel = truncateForModel(sourceText, 9000);

    const out = await checkPlagiarismWithClaude({
      url: url || sourceUrl,
      sourceUrl: sourceUrl || url,
      draftText: draftForModel,
      sourceText: sourceForModel,
      // cacheKey: if you want, send from client; otherwise helper will derive a key
      cacheKey: String(body?.cacheKey || "").trim(),
    });

    const plagiarism = clampPct(out?.plagiarism);
    const sources = Array.isArray(out?.sources) ? out.sources : [];
    const checkedAt = out?.checkedAt || new Date().toISOString();
    const cacheKey = out?.cacheKey || "";

    return NextResponse.json(
      { plagiarism, sources, checkedAt, cacheKey },
      { status: 200 }
    );
  } catch (e) {
    return NextResponse.json(
      { error: e?.message || "Failed to check plagiarism" },
      { status: 500 }
    );
  }
}
