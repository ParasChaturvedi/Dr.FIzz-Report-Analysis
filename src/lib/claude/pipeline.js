// src/lib/claude/pipeline.js
// Drop-in replacement for src/lib/perplexity/pipeline.js
// All function signatures and return shapes are identical.

import { claudeChat } from "@/lib/claude/client";
import {
  SiteProfileSchema,
  KeywordsSchema,
  CompetitorsSchema,
} from "@/lib/perplexity/schemas";
import {
  extractJsonObjectLoose,
  cleanList,
  toDomainish,
  normalizeHost,
} from "@/lib/perplexity/utils";
import { collectPublicSignals } from "@/lib/perplexity/publicSignals";
import { cacheGet, cacheSet } from "@/lib/perplexity/cache";

/* ----------------- helpers ----------------- */
function escapeRegex(s) {
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripTrailingGeo(kw, geoTokens) {
  let s = String(kw || "").trim();
  if (!s) return s;
  for (const t of geoTokens) {
    if (!t) continue;
    const re = new RegExp(`([,\\s]+)${escapeRegex(t)}$`, "i");
    s = s.replace(re, "").trim();
  }
  s = s.replace(/[,\-–—]+$/, "").trim();
  return s;
}

function clampPct(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(100, Math.round(x)));
}

function stableHashLite(str) {
  const s = String(str || "");
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

function coerceKeywordsList(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((k) => {
      if (typeof k === "string") return k;
      if (k && typeof k === "object") {
        return String(k.phrase || k.keyword || k.text || k.value || "").trim();
      }
      return "";
    })
    .filter(Boolean);
}

/* ----------------- plagiarism check ----------------- */
/**
 * Plagiarism estimation via Claude.
 * LLM-assisted estimation (not Turnitin-grade).
 */
export async function checkPlagiarismWithClaude({
  url = "",
  sourceUrl = "",
  draftText = "",
  sourceText = "",
  cacheKey = "",
} = {}) {
  const draft = String(draftText || "").trim();
  if (!draft) {
    return {
      plagiarism: 0,
      sources: [],
      checkedAt: new Date().toISOString(),
      cacheKey: "",
    };
  }

  const derivedKey =
    cacheKey ||
    `plag:${normalizeHost(String(sourceUrl || url || "unknown"))}:${stableHashLite(
      (sourceUrl || url || "") +
        "|" +
        draft.slice(0, 2000) +
        "|" +
        (sourceText || "").slice(0, 2000)
    )}`;

  const cached = cacheGet(derivedKey);
  if (cached && typeof cached === "object") return cached;

  const system = `
You are a plagiarism-checking engine for SEO content.

Goal:
Estimate how much of the DRAFT looks copied from existing online sources.
Also compare specifically against SOURCE PAGE (if provided).

Hard rules:
- Return ONLY valid JSON.
- plagiarismPercent must be a number 0..100.
- If you are uncertain, provide a conservative estimate and explain briefly in "notes".
- Provide up to 5 sources with URLs if you can identify likely matches.
- Do NOT return markdown.
`.trim();

  const user = `
SOURCE PAGE URL (may be empty): ${sourceUrl || "none"}
PAGE URL CONTEXT (may be empty): ${url || "none"}

SOURCE TEXT (excerpt, may be empty):
"""
${String(sourceText || "").slice(0, 9000)}
"""

DRAFT TEXT (excerpt):
"""
${draft.slice(0, 9000)}
"""

TASK:
1) Estimate plagiarismPercent (0..100) based on overlap with the SOURCE TEXT and other likely online sources.
2) If the draft is mostly a rewrite of source, plagiarismPercent should be high.
3) If it looks original and doesn't strongly match known phrasing, plagiarismPercent should be low.
4) Provide "sources": array of up to 5 objects: { "url": "...", "note": "why it matches" }
5) Provide "notes": short string.
Return JSON in this exact shape:
{
  "plagiarismPercent": number,
  "sources": [{ "url": string, "note": string }],
  "notes": string
}
`.trim();

  const { content } = await claudeChat({
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.1,
    max_tokens: 700,
  });

  const parsed = extractJsonObjectLoose(content) || {};
  const out = {
    plagiarism: clampPct(parsed.plagiarismPercent),
    sources: Array.isArray(parsed.sources)
      ? parsed.sources
          .filter(Boolean)
          .slice(0, 5)
          .map((s) => ({
            url: String(s?.url || "").trim(),
            note: String(s?.note || "").trim(),
          }))
          .filter((s) => s.url)
      : [],
    notes: String(parsed.notes || "").trim(),
    checkedAt: new Date().toISOString(),
    cacheKey: derivedKey,
  };

  cacheSet(derivedKey, out);
  return out;
}

/* ----------------- page-level keyword suggestions ----------------- */
/**
 * Generate keyword suggestions tailored to a specific page.
 * Output shape: { domain, keywords: string[], clusters, assumptions }
 */
export async function getKeywordsForPage({
  url = "",
  title = "",
  contentText = "",
  domain = "",
  industry = "",
  location = "",
  cacheKey = "",
} = {}) {
  const normDomain = normalizeHost(domain || url || "");
  const pageUrl = String(url || "").trim();
  const pageTitle = String(title || "").trim();
  const text = String(contentText || "").trim();
  const excerpt = text ? text.slice(0, 9000) : "";

  const derivedKey =
    String(cacheKey || "").trim() ||
    `pagekw:${normalizeHost(String(pageUrl || normDomain || "unknown"))}:${stableHashLite(
      `${pageUrl}|${pageTitle}|${industry}|${location}|${excerpt.slice(0, 2500)}`
    )}`;

  const cached = cacheGet(derivedKey);
  if (cached) return cached;

  const system = `
You are an SEO keyword strategist.
Return ONLY valid JSON. No markdown, no explanation — just the JSON object.

Hard rules:
- Keywords must be relevant to THIS PAGE'S topic and intent (not only the whole domain).
- Use real search phrases (2–7 words).
- Include mix: informational, commercial, transactional.
- Prefer phrases that could naturally appear in the page content.
- DO NOT append location to every keyword.
- If location is provided, only ~20–30% keywords should include geo modifiers.
- Avoid brand stuffing unless it is clearly central to the page.

Return JSON in EXACTLY this format:
{
  "domain": "example.com",
  "keywords": ["keyword phrase 1", "keyword phrase 2", "keyword phrase 3", "keyword phrase 4", "keyword phrase 5", "keyword phrase 6", "keyword phrase 7"],
  "clusters": [
    {"name": "cluster name", "keywords": ["kw1", "kw2", "kw3"]}
  ],
  "assumptions": []
}
`.trim();

  const user = `
PAGE CONTEXT:
- URL: ${pageUrl || "none"}
- Domain: ${normDomain || "none"}
- Title: ${pageTitle || "none"}
- Industry hint: ${industry || "none"}
- Location hint (use for SOME keywords only): ${location || "none"}

PAGE CONTENT (excerpt):
"""
${excerpt || "(no content provided)"}
"""

TASK:
Generate:
- 7 keyword phrases tailored to this page (70–80% non-geo, 20–30% geo if relevant).
- Up to 3 clusters.
`.trim();

  const { content } = await claudeChat({
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: KeywordsSchema,
    temperature: 0.22,
    max_tokens: 650,
  });

  const parsed = extractJsonObjectLoose(content) || {};
  const keywordsList = coerceKeywordsList(parsed.keywords);

  const out = {
    domain: normDomain || parsed.domain || "",
    keywords: cleanList(keywordsList, { max: 7 }),
    clusters: Array.isArray(parsed.clusters) ? parsed.clusters : [],
    assumptions: Array.isArray(parsed.assumptions) ? parsed.assumptions : [],
    cacheKey: derivedKey,
  };

  const geo = String(location || "").trim();
  const geoTokens = geo ? geo.split(",").map((x) => x.trim()).filter(Boolean) : [];

  if (geoTokens.length && out.keywords.length) {
    const geoLike = [];
    const nonGeo = [];
    for (const k of out.keywords) {
      const lower = String(k || "").toLowerCase();
      const hasGeoAtEnd = geoTokens.some((t) => lower.endsWith(t.toLowerCase()));
      if (hasGeoAtEnd) geoLike.push(k);
      else nonGeo.push(k);
    }
    const keepGeoCount = Math.min(geoLike.length, Math.max(1, Math.round(out.keywords.length * 0.3)));
    const keptGeo = geoLike.slice(0, keepGeoCount);
    const cleaned = nonGeo.concat(geoLike.slice(keepGeoCount)).map((k) => stripTrailingGeo(k, geoTokens));
    out.keywords = cleanList([...cleaned, ...keptGeo], { max: 7 });
  }

  cacheSet(derivedKey, out);
  return out;
}

/* ----------------- site profile ----------------- */
export async function getSiteProfile({
  input,
  industry = "",
  location = "",
  cacheKey = "",
}) {
  if (cacheKey) {
    const cachedSignals = cacheGet(`signals:${cacheKey}`);
    const cachedProfile = cacheGet(`profile:${cacheKey}`);
    if (cachedSignals && cachedProfile)
      return { profile: cachedProfile, signals: cachedSignals };
  }

  const signals =
    (cacheKey && cacheGet(`signals:${cacheKey}`)) ||
    (await collectPublicSignals(input));
  if (cacheKey) cacheSet(`signals:${cacheKey}`, signals);

  const system = `
You are an SEO intelligence engine.
You MUST determine what the business ACTUALLY is using public information:
- The website content provided
- And your own knowledge / public sources (do not rely only on guesses)

Return ONLY valid JSON. No markdown, no explanation — just the JSON object.
If uncertain, set businessType="unknown" and lower confidence.

Return JSON in EXACTLY this format:
{
  "domain": "example.com",
  "businessType": "service",
  "primaryOffering": "what they sell or offer in one sentence",
  "industry": "industry name",
  "offerings": ["offering term 1", "offering term 2", "offering term 3", "offering term 4", "offering term 5"],
  "geoFocus": "city, country or empty string",
  "confidence": 0.85,
  "publicSignalsUsed": ["source or signal used"],
  "assumptions": ["assumption made if any"]
}
`.trim();

  const user = `
Input: ${input}
Domain: ${signals.domain}
Optional industry hint (from user): ${industry || "none"}
Optional location hint (from user): ${location || "none"}

PUBLIC WEBSITE SIGNALS:
Homepage URL: ${signals.homepage.finalUrl}
Homepage title: ${signals.homepage.title}
Homepage meta description: ${signals.homepage.metaDescription}
Homepage snippet (truncated): ${signals.homepage.snippet}

Internal pages (truncated):
${signals.internalPages
  .map(
    (p, i) =>
      `#${i + 1} ${p.url}\n- title: ${p.title}\n- meta: ${p.metaDescription}\n- snippet: ${p.snippet}`
  )
  .join("\n\n")}

Robots/sitemaps:
- robots ok: ${signals.robots.ok} status: ${signals.robots.status}
- sitemap candidates: ${signals.robots.sitemaps.join(", ")}

TASK:
1) Identify what this business sells/offers (primaryOffering).
2) Choose businessType (product/service/marketplace/publisher/community/saas/unknown).
3) Provide 5–10 short "offerings" terms that define its universe.
4) Provide confidence 0..1.
5) List the public signals/sources you used.
`.trim();

  const { content } = await claudeChat({
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: SiteProfileSchema,
    temperature: 0.15,
    max_tokens: 900,
  });

  const parsed = extractJsonObjectLoose(content) || {};
  const profile = {
    domain: parsed.domain || signals.domain,
    businessType: parsed.businessType || "unknown",
    primaryOffering: parsed.primaryOffering || "",
    industry: parsed.industry || industry || "",
    offerings: cleanList(parsed.offerings, { max: 12 }),
    geoFocus: parsed.geoFocus || location || "",
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.35,
    publicSignalsUsed: Array.isArray(parsed.publicSignalsUsed) ? parsed.publicSignalsUsed : [],
    assumptions: Array.isArray(parsed.assumptions) ? parsed.assumptions : [],
  };

  if (cacheKey) cacheSet(`profile:${cacheKey}`, profile);
  return { profile, signals };
}

/* ----------------- keywords from profile ----------------- */
export async function getKeywordsFromProfile({
  profile,
  signals,
  location = "",
  cacheKey = "",
}) {
  if (cacheKey) {
    const cached = cacheGet(`keywords:${cacheKey}`);
    if (cached) return cached;
  }

  const system = `
You are an SEO keyword strategist.
Return ONLY valid JSON. No markdown, no explanation — just the JSON object.

Hard rules:
- Keywords must match the business universe described by offerings/primaryOffering.
- Be SPECIFIC to the client's actual niche/offerings — avoid broad industry catch-all terms (e.g. for a focused firm, prefer its real services over generic umbrella phrases like "technology solutions" or "digital transformation").
- Prefer real search phrases (2–5 words).
- Include a mix: informational, commercial, transactional.
- DO NOT append location to every keyword.
- Mix geo naturally:
  - ~70% keywords should be NON-geo (no city/state/country)
  - ~30% keywords can be geo-modified (include location naturally)

Return JSON in EXACTLY this format:
{
  "domain": "example.com",
  "keywords": ["keyword phrase 1", "keyword phrase 2", "keyword phrase 3", "keyword phrase 4", "keyword phrase 5", "keyword phrase 6", "keyword phrase 7", "keyword phrase 8", "keyword phrase 9", "keyword phrase 10", "keyword phrase 11", "keyword phrase 12", "keyword phrase 13", "keyword phrase 14", "keyword phrase 15", "keyword phrase 16", "keyword phrase 17", "keyword phrase 18", "keyword phrase 19", "keyword phrase 20"],
  "clusters": [
    {"name": "cluster name 1", "keywords": ["kw1", "kw2", "kw3"]},
    {"name": "cluster name 2", "keywords": ["kw4", "kw5", "kw6"]}
  ],
  "assumptions": []
}
`.trim();

  const user = `
Domain: ${profile.domain}
Business type: ${profile.businessType}
Industry: ${profile.industry}
Primary offering: ${profile.primaryOffering}
Offerings universe tokens: ${profile.offerings.join(", ")}
Geo focus (use for SOME keywords only): ${location || profile.geoFocus || "none"}

Homepage title: ${signals.homepage.title}
Homepage meta: ${signals.homepage.metaDescription}

TASK:
Generate exactly 20 keyword phrases (70% non-geo, 30% geo-modified) and up to 6 clusters.
`.trim();

  const { content } = await claudeChat({
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: KeywordsSchema,
    temperature: 0.22,
    max_tokens: 1100,
  });

  const parsed = extractJsonObjectLoose(content) || {};
  const out = {
    domain: profile.domain,
    keywords: cleanList(parsed.keywords, { max: 24 }),
    clusters: Array.isArray(parsed.clusters) ? parsed.clusters : [],
    assumptions: Array.isArray(parsed.assumptions) ? parsed.assumptions : [],
  };

  const geo = String(location || profile.geoFocus || "").trim();
  const geoTokens = geo ? geo.split(",").map((x) => x.trim()).filter(Boolean) : [];

  if (geoTokens.length && out.keywords.length) {
    const geoLike = [];
    const nonGeo = [];
    for (const k of out.keywords) {
      const lower = String(k || "").toLowerCase();
      const hasGeoAtEnd = geoTokens.some((t) => lower.endsWith(t.toLowerCase()));
      if (hasGeoAtEnd) geoLike.push(k);
      else nonGeo.push(k);
    }
    const keepGeoCount = Math.max(3, Math.round(out.keywords.length * 0.3));
    const keptGeo = geoLike.slice(0, keepGeoCount);
    const cleaned = nonGeo.concat(geoLike.slice(keepGeoCount)).map((k) => stripTrailingGeo(k, geoTokens));
    out.keywords = cleanList([...cleaned, ...keptGeo], { max: 24 });
  }

  if (cacheKey) cacheSet(`keywords:${cacheKey}`, out);
  return out;
}

/* ----------------- competitors from profile ----------------- */
export async function getCompetitorsFromProfile({
  profile,
  signals,
  seedKeywords = [],
  cacheKey = "",
}) {
  if (cacheKey) {
    const cached = cacheGet(`competitors:${cacheKey}`);
    if (cached) return cached;
  }

  const system = `
You are an SEO competitive research engine.
Return ONLY valid JSON. No markdown, no explanation — just the JSON object.

Definitions:
- businessCompetitors: direct competitors offering similar products/services (return their domain names like example.com).
- searchCompetitors: websites that rank for these keywords — can include aggregators, directories, publishers (return domain names).

Hard rules:
- ALWAYS return real, EXISTING domain names with extensions.
- businessCompetitors MUST be REAL companies DIRECTLY COMPARABLE to the client in size, segment, and region — the businesses a real buyer would shortlist alongside this client. Do NOT return industry mega-corporations, conglomerates, or household-name giants (e.g. for a small/mid IT-services firm do NOT return tcs.com / infosys.com / wipro.com / cognizant.com; for a small store do NOT return amazon.com / flipkart.com) UNLESS the client itself genuinely operates at that scale. Match the client's tier.
- businessCompetitors MUST be in the same universe as the offerings AND specific to the client's actual niche (not the whole broad industry).
- searchCompetitors are sites that RANK for these keywords (aggregators/directories/publishers allowed) and MUST differ from businessCompetitors.

Return JSON in EXACTLY this format:
{
  "domain": "example.com",
  "businessCompetitors": ["competitor1.com", "competitor2.com", "competitor3.com", "competitor4.com", "competitor5.com", "competitor6.com", "competitor7.com", "competitor8.com"],
  "searchCompetitors": ["site1.com", "site2.com", "site3.com", "site4.com", "site5.com", "site6.com", "site7.com", "site8.com", "site9.com", "site10.com", "site11.com", "site12.com"],
  "buckets": {
    "directSellers": ["domain.com"],
    "marketplaces": ["domain.com"],
    "affiliateBlogs": ["domain.com"],
    "directories": ["domain.com"],
    "other": []
  },
  "assumptions": []
}
`.trim();

  const seeds = seedKeywords.slice(0, 8).join(", ");

  const user = `
Domain: ${profile.domain}
Business type: ${profile.businessType}
Industry: ${profile.industry}
Primary offering: ${profile.primaryOffering}
Offerings universe tokens: ${profile.offerings.join(", ")}

Homepage title: ${signals.homepage.title}
Homepage meta: ${signals.homepage.metaDescription}

Seed keywords: ${seeds || "none"}

TASK:
1) Identify 8 business competitors (direct substitutes — return real domain names with .com/.in/.co etc.)
2) Identify 12 search competitors (domains that rank for similar keywords — return real domain names)
3) Fill buckets with the search competitor domains
`.trim();

  const { content } = await claudeChat({
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: CompetitorsSchema,
    temperature: 0.22,
    max_tokens: 1200,
  });

  const parsed = extractJsonObjectLoose(content) || {};
  const domain = profile.domain;

  const businessCompetitors = cleanList(
    (parsed.businessCompetitors || []).map(toDomainish),
    { max: 12 }
  ).filter((x) => normalizeHost(x) !== domain);

  const bizSet = new Set(businessCompetitors.map((x) => normalizeHost(x)));

  const searchCompetitors = cleanList(
    (parsed.searchCompetitors || []).map(toDomainish),
    { max: 20 }
  )
    .filter((x) => normalizeHost(x) !== domain)
    .filter((x) => !bizSet.has(normalizeHost(x)));

  const buckets = parsed.buckets && typeof parsed.buckets === "object" ? parsed.buckets : {};

  const out = {
    domain,
    businessCompetitors,
    searchCompetitors,
    buckets,
    assumptions: Array.isArray(parsed.assumptions) ? parsed.assumptions : [],
  };

  if (cacheKey) cacheSet(`competitors:${cacheKey}`, out);
  return out;
}
