// app/api/keywords/page-suggest/route.js
import { NextResponse } from "next/server";
import { getKeywordsForPage } from "@/lib/claude/pipeline";
import { normalizeHost } from "@/lib/perplexity/utils";
import { claudeChat } from "@/lib/claude/client";
import { extractJsonObjectLoose } from "@/lib/perplexity/utils";

export const runtime = "nodejs";

function buildLocation({ location, city, state, country }) {
  const direct = String(location || "").trim();
  if (direct) return direct;
  return [city, state, country]
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .join(", ");
}

function normalizeUrlLike(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  try {
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const u = new URL(withScheme);
    u.hash = "";
    return u.toString();
  } catch {
    return raw;
  }
}

function makeKey({ url = "", title = "", industry = "", location = "" }) {
  return [url, title, industry, location]
    .map((x) => String(x || "").trim().toLowerCase())
    .join("|");
}

function safeStr(x) {
  return String(x ?? "").trim();
}

function normalizePhraseKey(s) {
  return safeStr(s).toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Ask Claude AI to find example pages (blogs/pages) that contain / rank for each keyword.
 * Returns a map: phraseKey -> { links: [{url,title,snippet}] }
 */
async function getKeywordSourcesViaClaude({
  domain = "",
  pageUrl = "",
  pageTitle = "",
  contentText = "",
  keywords = [],
  maxKeywords = 10,
  maxLinksPerKeyword = 5,
}) {
  const kw = (Array.isArray(keywords) ? keywords : [])
    .map((k) => safeStr(k))
    .filter(Boolean)
    .slice(0, maxKeywords);

  if (!kw.length) return new Map();

  const system = `
You are an SEO research assistant.

Goal:
For each keyword phrase, find example pages (preferably from the SAME SITE domain if available) that are relevant and likely to contain that phrase or closely match it.

Rules:
- Return ONLY valid JSON. No markdown.
- For each keyword:
  - Provide 2 to ${maxLinksPerKeyword} links if possible.
  - Prefer URLs on the same domain: "${domain}" (if domain is provided).
  - If you cannot find enough on that domain, you may include relevant external URLs.
  - Each link must include: url, title, snippet (1-2 lines).
- Keep snippets short, no quotes longer than ~20 words.
JSON shape:
{
  "items": [
    {
      "phrase": "string",
      "links": [{ "url": "string", "title": "string", "snippet": "string" }]
    }
  ]
}
`.trim();

  const user = `
CONTEXT:
- Domain preference: ${domain || "none"}
- Current page URL: ${pageUrl || "none"}
- Current page title: ${pageTitle || "none"}

Current page content excerpt:
"""
${safeStr(contentText).slice(0, 2500)}
"""

KEYWORDS:
${kw.map((k, i) => `${i + 1}. ${k}`).join("\n")}

Task:
For EACH keyword, return example pages (blogs/pages) with url/title/snippet.
`.trim();

  const { content } = await claudeChat({
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.2,
    max_tokens: 1400,
  });

  const parsed = extractJsonObjectLoose(content) || {};
  const items = Array.isArray(parsed.items) ? parsed.items : [];

  const out = new Map();
  for (const it of items) {
    const phrase = safeStr(it?.phrase);
    if (!phrase) continue;
    const linksRaw = Array.isArray(it?.links) ? it.links : [];
    const links = linksRaw
      .map((l) => ({
        url: safeStr(l?.url || l?.link),
        title: safeStr(l?.title) || safeStr(l?.url || l?.link),
        snippet: safeStr(l?.snippet || l?.description),
      }))
      .filter((l) => l.url)
      .slice(0, maxLinksPerKeyword);

    out.set(normalizePhraseKey(phrase), { links });
  }

  return out;
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));

    const url = normalizeUrlLike(body?.url || body?.pageUrl || "");
    const title = safeStr(body?.title || body?.pageTitle || "");
    const contentText = safeStr(body?.contentText || body?.text || "");

    const industry = safeStr(body?.industry || "");
    const location = buildLocation({
      location: body?.location,
      city: body?.city,
      state: body?.state,
      country: body?.country,
    });

    if (!url && !title && !contentText) {
      return NextResponse.json(
        {
          error:
            "Missing page context: provide at least url, title, or contentText",
        },
        { status: 400 }
      );
    }

    const domain = normalizeHost(body?.domain || body?.site || url || "");

    const cacheKey =
      safeStr(body?.cacheKey) || makeKey({ url, title, industry, location });

    // 1) Claude AI: page-specific keyword suggestions
    const result = await getKeywordsForPage({
      url,
      title,
      contentText,
      domain,
      industry,
      location,
      cacheKey,
    });

    const keywordList = Array.isArray(result?.keywords) ? result.keywords : [];

    // 2) Claude AI: sources (blogs/pages) for each keyword so UI drawer works like before
    //    (Prefer same-domain URLs when possible)
    const sourcesMap = await getKeywordSourcesViaClaude({
      domain,
      pageUrl: url,
      pageTitle: title,
      contentText,
      keywords: keywordList,
      maxKeywords: Number(body?.maxKeywords || 10),
      maxLinksPerKeyword: Number(body?.maxLinksPerKeyword || 5),
    });

    // 3) Return keyword objects: { phrase, sourcesCount, links[] }
    const keywords = keywordList.map((phrase) => {
      const key = normalizePhraseKey(phrase);
      const pack = sourcesMap.get(key) || { links: [] };
      const links = Array.isArray(pack.links) ? pack.links : [];
      return {
        phrase: safeStr(phrase),
        sourcesCount: links.length,
        links,
      };
    });

    return NextResponse.json(
      {
        url,
        domain,
        title,
        // ✅ now keyword objects, so UI shows numeric sources + drawer cards
        keywords,
        clusters: Array.isArray(result?.clusters) ? result.clusters : [],
        meta: {
          industry,
          location,
          cacheKey,
        },
      },
      { status: 200 }
    );
  } catch (e) {
    return NextResponse.json(
      { error: e?.message || "Page keyword suggest failed" },
      { status: 500 }
    );
  }
}
