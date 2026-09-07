// src/app/api/content/meta/route.js
// Fast SEO meta generation for the Content Editor's SEO Details panel.
// Given a primary keyword (and optional working title / current content / domain),
// returns a click-worthy SEO <title> and meta description that follow the house
// standard: no em/en dashes, no machine tell-words, primary keyword included,
// title <= 60 chars, description <= 155 chars.
//
// Kept deliberately small and quick (non-streaming, low max_tokens) so the
// "Generate title" / "Generate description" buttons feel instant.

import { NextResponse } from "next/server";
import { claudeChat } from "@/lib/claude/client";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM = `You are a senior SEO copywriter with 20 years of experience writing high-CTR search snippets.
You write SEO meta titles and meta descriptions that rank and get clicked.

RULES:
- The meta TITLE must be <= 60 characters, include the primary keyword naturally, and read like a human wrote it.
- The meta DESCRIPTION must be <= 155 characters, include the primary keyword once, be specific and benefit-led, and end without a trailing full stop only if it flows better.
- NEVER use em dashes or en dashes. Use commas or the words "to" and "and".
- NEVER use machine tell-words: delve, leverage, moreover, robust, seamless, unlock, elevate, tapestry, game-changer.
- No clickbait, no ALL CAPS, no emoji. Title Case for the title, sentence case for the description.
- Return STRICT JSON only, no prose, no code fences.`;

function buildUser({ keyword, title, description, domain, kind }) {
  const want =
    kind === "title"
      ? `Generate ONE new SEO meta title.`
      : kind === "description"
      ? `Generate ONE new SEO meta description.`
      : `Generate ONE new SEO meta title AND ONE new meta description.`;
  return [
    want,
    keyword ? `Primary keyword: ${keyword}` : "",
    title ? `Current / working title: ${title}` : "",
    description ? `Current description: ${description}` : "",
    domain ? `Website: ${domain}` : "",
    "",
    `Return strict JSON with exactly these keys: {"metaTitle":"...","metaDescription":"..."}`,
    kind === "title" ? `(metaDescription may be an empty string.)` : "",
    kind === "description" ? `(metaTitle may be an empty string.)` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function parseMeta(text) {
  const raw = String(text || "").trim();
  // Strip code fences if the model added them anyway.
  const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (!m) return {};
  try {
    return JSON.parse(m[0]);
  } catch {
    return {};
  }
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const keyword = String(body?.keyword || "").trim();
    const title = String(body?.title || "").trim();
    const description = String(body?.description || "").trim();
    const domain = String(body?.domain || "").trim();
    const kind = ["title", "description", "both"].includes(body?.kind)
      ? body.kind
      : "both";

    if (!keyword && !title && !description) {
      return NextResponse.json(
        { ok: false, error: "A keyword or title is required." },
        { status: 400 }
      );
    }

    const { content } = await claudeChat({
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: buildUser({ keyword, title, description, domain, kind }) },
      ],
      max_tokens: 400,
      temperature: 0.5,
      timeoutMs: 45000,
      meta: { domain, api: "content-meta", label: kind },
    });

    const meta = parseMeta(content);
    let metaTitle = String(meta.metaTitle || "").trim();
    let metaDescription = String(meta.metaDescription || "").trim();

    // Belt-and-braces: strip any dashes the model slipped in.
    metaTitle = metaTitle.replace(/\s*[—–]\s*/g, " ").replace(/\s{2,}/g, " ").trim();
    metaDescription = metaDescription.replace(/\s*[—–]\s*/g, ", ").replace(/\s{2,}/g, " ").trim();

    return NextResponse.json({ ok: true, metaTitle, metaDescription });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Meta generation failed" },
      { status: 500 }
    );
  }
}
