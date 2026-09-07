// src/app/api/content/suggest/route.js
// Research-based blog topic suggestions for the Content Editor's "New blog" flow.
//
// The Content Editor shows 5 trendy, specific blog topics BEFORE generation, so
// the client can pick one. These are grounded on REAL data — the site's own
// profile and the keyword universe produced by the existing keyword pipeline
// (getSiteProfile + getKeywordsFromProfile) — not invented from thin air.
//
// Returns { ok, suggestions: [{ title, primaryKeyword, angle, intent, difficulty }], profile }.

import { NextResponse } from "next/server";
import { getSiteProfile, getKeywordsFromProfile } from "@/lib/claude/pipeline";
import { claudeChat } from "@/lib/claude/client";
import { normalizeHost } from "@/lib/perplexity/utils";

export const runtime = "nodejs";
export const maxDuration = 120;

const DASH = /\s*[—–]\s*/g;

function parseSuggestions(text) {
  const raw = String(text || "").trim();
  const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  // Grab the first JSON array or object.
  const arr = cleaned.match(/\[[\s\S]*\]/);
  let list = [];
  if (arr) {
    try { list = JSON.parse(arr[0]); } catch {}
  }
  if (!Array.isArray(list) || !list.length) {
    const obj = cleaned.match(/\{[\s\S]*\}/);
    if (obj) {
      try {
        const parsed = JSON.parse(obj[0]);
        list = Array.isArray(parsed?.suggestions) ? parsed.suggestions : [];
      } catch {}
    }
  }
  return Array.isArray(list) ? list : [];
}

function cleanStr(s) {
  return String(s || "").replace(DASH, " ").replace(/\s{2,}/g, " ").trim();
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const domain = normalizeHost(body?.domain || body?.site || body?.url || "");
    if (!domain) {
      return NextResponse.json({ ok: false, error: "Missing domain" }, { status: 400 });
    }

    const industry = String(body?.industry || "").trim();
    const location = String(body?.location || "").trim();
    const businessContext = String(body?.businessContext || "").trim();
    const count = Math.min(Math.max(Number(body?.count) || 5, 3), 8);
    const existing = Array.isArray(body?.existing)
      ? body.existing.map((x) => String(x || "").trim()).filter(Boolean).slice(0, 40)
      : [];

    const cacheKey = [domain, industry, location].map((x) => x.toLowerCase()).join("|");

    // Real grounding: the site's own profile + keyword universe.
    const { profile, signals } = await getSiteProfile({ input: domain, industry, location, cacheKey });
    const kw = await getKeywordsFromProfile({ profile, signals, location, cacheKey });
    const keywords = Array.isArray(kw?.keywords) ? kw.keywords : [];
    const clusters = Array.isArray(kw?.clusters) ? kw.clusters : [];

    const system = `You are a senior SEO content strategist with 20 years of experience.
You propose BLOG topic ideas that are trendy, specific, genuinely useful, and winnable in search.

Rules:
- Ground every idea in the business profile and the REAL keyword universe provided. Do not drift into unrelated topics.
- Each topic must target a distinct primary keyword and search intent (mix informational and commercial-investigation).
- Titles read like a human wrote them: specific, benefit-led, no clickbait, no ALL CAPS, no emoji.
- NEVER use em dashes or en dashes. Use commas or the words "to" and "and".
- NEVER use machine tell-words: delve, leverage, moreover, robust, seamless, unlock, elevate, tapestry, game-changer.
- Avoid duplicating any titles the site already has.
- Return STRICT JSON only. No prose, no code fences.`;

    const user = `Business profile:
Domain: ${profile.domain}
Business type: ${profile.businessType}
Industry: ${profile.industry}
Primary offering: ${profile.primaryOffering}
Geo focus: ${location || profile.geoFocus || "none"}
${businessContext ? `Extra context: ${businessContext}` : ""}

Real keyword universe (grounding): ${keywords.slice(0, 20).join(", ") || "(none)"}
Topic clusters: ${clusters.map((c) => c?.name).filter(Boolean).join(", ") || "(none)"}
${existing.length ? `Titles already on the site (DO NOT duplicate): ${existing.join(" | ")}` : ""}

TASK: Propose exactly ${count} blog topic ideas. Return STRICT JSON:
[
  {"title":"...","primaryKeyword":"...","angle":"one-line reason this topic is worth writing now","intent":"informational|commercial|transactional","difficulty":"low|medium|high"}
]`;

    const { content } = await claudeChat({
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: 1200,
      temperature: 0.5,
      timeoutMs: 90000,
      meta: { domain, api: "content-suggest", label: "blog-topics" },
    });

    let suggestions = parseSuggestions(content)
      .map((s) => ({
        title: cleanStr(s?.title),
        primaryKeyword: cleanStr(s?.primaryKeyword),
        angle: cleanStr(s?.angle),
        intent: ["informational", "commercial", "transactional"].includes(String(s?.intent || "").toLowerCase())
          ? String(s.intent).toLowerCase()
          : "informational",
        difficulty: ["low", "medium", "high"].includes(String(s?.difficulty || "").toLowerCase())
          ? String(s.difficulty).toLowerCase()
          : "medium",
      }))
      .filter((s) => s.title)
      .slice(0, count);

    return NextResponse.json({
      ok: true,
      suggestions,
      profile: {
        domain: profile.domain,
        businessType: profile.businessType,
        industry: profile.industry,
        primaryOffering: profile.primaryOffering,
        geoFocus: profile.geoFocus,
      },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e?.message || "Suggestion failed" }, { status: 500 });
  }
}
