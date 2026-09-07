// src/app/api/content/generate/route.js
// Real AI content generation for the Content Editor — 4 flows:
//   blog+new   -> full publication-ready blog (content writer, 20 yrs)
//   blog+existing -> improvement suggestions for an existing blog
//   page+new   -> SEO-optimised, humanised web-page copy (copywriter, 20 yrs)
//   page+existing -> revamp suggestions for an existing page
//
// Strictly follows the house content standard (Acenteus session export):
// answer-first, house structure, short scannable paragraphs, question-form H2s,
// key-takeaways, FAQ + Sources, NAMED author for E-E-A-T, unique internal links,
// authoritative external links, NO em/en dashes, NO machine tell-words.
//
// Backs the Content Editor "Start with AI", "Generate article", etc. hooks.

import { NextResponse } from "next/server";
import { claudeChatStream } from "@/lib/claude/client";

export const runtime = "nodejs";
export const maxDuration = 300;

const MACHINE_WORDS = [
  "delve", "leverage", "moreover", "robust", "seamless", "furthermore",
  "in conclusion", "it is important to note", "navigate the landscape",
  "in today's fast-paced", "unlock", "elevate", "game-changer", "tapestry",
];

/** Shared writing rules injected into every generation. */
function houseRules() {
  return `
NON-NEGOTIABLE WRITING RULES:
- Answer the primary question in the FIRST paragraph (answer-first).
- Short, scannable paragraphs. Never more than ~80 words per paragraph. Break long blocks into 2-3 sentences.
- Use question-form H2 headings where natural (e.g. "How does X work?").
- Include a "Key takeaways" section near the top with bold-lead bullet points.
- Use HTML tables (full width) for any comparison or data — <table><thead><tr><th>… with a header row.
- End with an FAQ section (question-form H3s) and a "Sources" section listing authoritative references.
- Include a short named author block for E-E-A-T (a plausible credentialed author, e.g. "Written by … , ACCA/CIMA" style relevant to the business).
- NEVER use em dashes (—) or en dashes (–). Use commas, full stops, or "to"/"and".
- NEVER use machine tell-words: ${MACHINE_WORDS.join(", ")}.
- Write in a confident, human, experienced voice. Vary sentence length. No fluff.
- LINKS: include UNIQUE internal links (each internal URL used at most once) and 2-4 authoritative EXTERNAL links per ~1000 words (gov / official / recognised-body sources). Name competitors but never link to them.
- Output CLEAN semantic HTML only for the article body: <h1>, <h2>, <h3>, <p>, <ul>/<ol>/<li>, <table>, <strong>, <a href>. No <html>/<head>/<body>, no markdown, no code fences around the article.`.trim();
}

function personaFor(type) {
  return type === "page"
    ? "You are a senior SEO copywriter with 20 years of experience writing high-converting, SEO-optimised, genuinely human website page copy for businesses."
    : "You are a senior SEO content writer with 20 years of experience producing publication-ready, SERP-leading blog articles.";
}

function buildSystemPrompt({ type, mode }) {
  const persona = personaFor(type);
  if (mode === "existing") {
    return `${persona}

TASK: The user will give you an EXISTING ${type} (its keyword, title and current content). Produce a concrete, prioritised IMPROVEMENT PLAN — exactly what to ADD, what to REPLACE, and what to REMOVE for better SEO and results. Keep the existing content's intent; you are advising a revamp, not rewriting from scratch.

${houseRules()}

RESPONSE FORMAT — return in this exact order:
1) A single line: \`\`\`json {"metaTitle":"…","metaDescription":"…","primaryKeyword":"…","secondaryKeywords":["…"],"suggestedUrl":"/…"} \`\`\`
2) Then clean HTML: an <h2>Improvement plan</h2> followed by three subsections — <h3>Add</h3>, <h3>Replace / rewrite</h3>, <h3>Remove</h3> — each with specific, actionable bullet points that reference the actual content. Include a short prioritised checklist at the end.`;
  }
  return `${persona}

TASK: Write a COMPLETE, publication-ready ${type} for the given primary keyword and business. It must be original, accurate, genuinely useful and ready to publish.

${houseRules()}

RESPONSE FORMAT — return in this exact order:
1) A single line: \`\`\`json {"metaTitle":"…(<=60 chars)","metaDescription":"…(<=155 chars)","primaryKeyword":"…","secondaryKeywords":["…","…"],"suggestedUrl":"/…"} \`\`\`
2) Then the full article as clean semantic HTML starting with an <h1> title, following the house structure (answer-first intro, Key takeaways, question-form H2s, tables where useful, FAQ, Sources, author block).`;
}

function buildUserPrompt({ type, mode, keyword, title, domain, businessContext, existingContent, wordTarget }) {
  const site = domain ? `Business website: ${domain}.` : "";
  const biz = businessContext ? `Business context: ${businessContext}.` : "";
  const words = wordTarget || (type === "page" ? 900 : 3200);
  if (mode === "existing") {
    return [
      `${type === "page" ? "Existing PAGE" : "Existing BLOG"} to improve.`,
      title ? `Title: ${title}` : "",
      keyword ? `Primary keyword: ${keyword}` : "",
      site, biz,
      "Current content (HTML or text):",
      (existingContent || "(none provided — infer from the title/keyword)").slice(0, 12000),
    ].filter(Boolean).join("\n");
  }
  return [
    `Write a new ${type} of about ${words}+ words.`,
    keyword ? `Primary keyword to target: ${keyword}` : "",
    title ? `Working title / topic: ${title}` : "",
    site, biz,
    "Make it specific, evidence-led and better than the current top SERP results.",
  ].filter(Boolean).join("\n");
}

/** Pull the ```json {…} ``` metadata block out and return {meta, html}. Robust: the
 *  meta block can appear anywhere, HTML may be wrapped in ```html fences, and html is
 *  never returned empty when the model actually produced content. */
function splitMetaAndHtml(text) {
  let meta = {};
  const raw = String(text || "").trim();
  let html = raw;

  const fence = html.match(/```json\s*([\s\S]*?)```/i);
  if (fence) {
    try { meta = JSON.parse(fence[1].trim()); } catch {}
    html = (html.slice(0, fence.index) + html.slice(fence.index + fence[0].length)).trim();
  } else {
    const m = html.match(/\{[\s\S]*?"metaTitle"[\s\S]*?\}/);
    if (m) { try { meta = JSON.parse(m[0]); } catch {} html = html.replace(m[0], "").trim(); }
  }

  // Strip any stray code fences (```html … ```)
  html = html.replace(/```html/gi, "").replace(/```/g, "").trim();

  // Guarantee non-empty HTML when the model produced content.
  if (!html) {
    html = raw.replace(/```json[\s\S]*?```/i, "").replace(/```/g, "").trim();
  }
  // If it still isn't HTML but has text, wrap it minimally so the editor renders it.
  if (html && !/<[a-z][\s\S]*>/i.test(html)) {
    html = html.split(/\n{2,}/).map((p) => `<p>${p.trim()}</p>`).join("\n");
  }
  return { meta, html };
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const type = body?.type === "page" ? "page" : "blog";
    const mode = body?.mode === "existing" ? "existing" : "new";
    const keyword = String(body?.keyword || "").trim();
    const title = String(body?.title || "").trim();
    const domain = String(body?.domain || "").trim();
    const businessContext = String(body?.businessContext || "").trim();
    const existingContent = String(body?.existingContent || "");
    const wordTarget = Number(body?.wordTarget) || 0;

    if (!keyword && !title) {
      return NextResponse.json({ ok: false, error: "A keyword or title is required." }, { status: 400 });
    }

    const messages = [
      { role: "system", content: buildSystemPrompt({ type, mode }) },
      { role: "user", content: buildUserPrompt({ type, mode, keyword, title, domain, businessContext, existingContent, wordTarget }) },
    ];

    const { content } = await claudeChatStream({
      messages,
      max_tokens: mode === "existing" ? 4000 : 9000,
      timeoutMs: 280000,
      meta: { domain, api: "content-generate", label: `${type}:${mode}` },
    });

    const { meta, html } = splitMetaAndHtml(content);

    return NextResponse.json({
      ok: true,
      type,
      mode,
      contentHtml: html,
      meta: {
        metaTitle: meta.metaTitle || title || keyword || "",
        metaDescription: meta.metaDescription || "",
        primaryKeyword: meta.primaryKeyword || keyword || "",
        secondaryKeywords: Array.isArray(meta.secondaryKeywords) ? meta.secondaryKeywords : [],
        suggestedUrl: meta.suggestedUrl || "",
      },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e?.message || "Content generation failed" }, { status: 500 });
  }
}
