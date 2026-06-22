// src/app/api/seo/business-taxonomy/route.js
// ─────────────────────────────────────────────────────────────────────────────
// Step-2 SMART DROPDOWNS — Claude analyzes the Step-1 website and returns DETAILED,
// business-specific options for the cascading Industry → Offering → Category dropdowns
// so Steps 1-5 capture an accurate business profile (which sharpens every downstream
// data source: GEO/LLM, GMB, DataForSEO, Moz, Playwright, Claude analysis).
//
//   POST /api/seo/business-taxonomy
//   body: { domain, level: "industry"|"offering"|"category", industry?, offering?, context? }
//
//   level "industry" → crawls the site (collectPublicSignals) + Opus 4.8 → detected
//                      industry/offering/category + confidence + ranked industries +
//                      offerings & categories for the detected path + core_services /
//                      business_scope to pre-fill.
//   level "offering" → Sonnet (no crawl) → offering types for a chosen industry.
//   level "category" → Sonnet (no crawl) → specific categories for industry+offering.
//
// Every list is most-relevant-first and EXCLUDES "Other" (the UI always appends it,
// so the user can type a custom value). Results cached 30 days per domain+level.
// Fails soft: returns { ok:false, fallback:true } (HTTP 200) so the wizard can fall
// back to its built-in lists and never block the user.
// ─────────────────────────────────────────────────────────────────────────────
import { collectPublicSignals } from "@/lib/perplexity/publicSignals";
import { claudeChat } from "@/lib/claude/client";
import { extractJsonObjectLoose } from "@/lib/perplexity/utils";
import { getOrFetch } from "@/lib/cache/mongo";

export const runtime = "nodejs";
export const maxDuration = 120;

const OPUS = "claude-opus-4-8";
const SONNET = "claude-sonnet-4-6";
const OFFERING_BASE = ["Services", "Products", "Digital/Software", "Hybrid - Multiple Types"];

const cleanDomain = (s) => String(s || "").trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/.*$/, "").toLowerCase();
const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
function uniqStrings(a, max = 14) {
  const seen = new Set(); const out = [];
  for (const x of (Array.isArray(a) ? a : [])) {
    const v = String(x || "").trim();
    const k = v.toLowerCase();
    if (v && v.length <= 70 && k !== "other" && k !== "others" && !seen.has(k)) { seen.add(k); out.push(v); if (out.length >= max) break; }
  }
  return out;
}

// ── INDUSTRY level — crawl + Opus → full detected profile + ranked options ────
async function industryTaxonomy(domain) {
  const signals = await collectPublicSignals(domain).catch(() => null);
  const hp = signals?.homepage || {};
  const sigText = signals
    ? `Homepage URL: ${hp.finalUrl || ""}
Homepage title: ${hp.title || ""}
Homepage meta description: ${hp.metaDescription || ""}
Homepage snippet (truncated): ${String(hp.snippet || "").slice(0, 1500)}

Internal pages (truncated):
${(signals.internalPages || []).slice(0, 4).map((p, i) => `#${i + 1} ${p.url}\n  title: ${p.title || ""}\n  meta: ${p.metaDescription || ""}\n  snippet: ${String(p.snippet || "").slice(0, 400)}`).join("\n")}`
    : "(website signals unavailable — infer from the domain name and your own public knowledge of this business)";

  const system = `You are a business-classification expert for an SEO/GEO analytics platform. From REAL signals on a company's website, identify exactly what the business is and produce DETAILED, specific options for an onboarding form's cascading dropdowns (Industry Sector → Offering Type → Specific Category).

Return ONLY valid JSON (no markdown, no prose):
{
  "detected_industry": "the single MOST-LIKELY, specific industry sector (e.g. 'Digital Marketing Agency', 'Dental Clinic', 'B2B SaaS — HR Software') — be specific, not just 'Marketing'",
  "detected_offering": "one of: Services | Products | Digital/Software | Hybrid - Multiple Types",
  "detected_category": "the single most-likely specific service/product category this business leads with",
  "business_type": "service | product | marketplace | saas | publisher | community | local-business | unknown",
  "primary_offering": "what they sell/offer, one sentence",
  "core_services": ["3-8 SPECIFIC services or products this business actually offers"],
  "business_scope": "Local | Regional | National | International",
  "confidence": 0.0-1.0,
  "industries": ["8-12 plausible industry sectors, MOST-LIKELY FIRST and specific; include 2-3 slightly broader alternatives at the end so the user can always find a fit"],
  "offerings": ["4-8 offering types that fit the DETECTED industry, most common first (mix of: Services, Products, Digital/Software, Consulting, SaaS, Hybrid - Multiple Types, etc.)"],
  "categories": ["8-14 SPECIFIC service/product categories under the detected industry + offering, most relevant first (e.g. for a marketing agency: 'SEO Services','PPC Management','Content Marketing','Social Media Management','Web Design & Development','Branding & Identity','Email Marketing','Conversion Rate Optimization')"]
}
Rules: be SPECIFIC to THIS business, not generic. Every list item must be distinct, real and useful. Do NOT include any "Other"/"Others" item — the UI adds that itself. Order every list most-relevant first.`;

  const user = `Domain: ${domain}\n\nPUBLIC WEBSITE SIGNALS:\n${sigText}\n\nClassify this exact business and produce the cascading dropdown options.`;
  const { content } = await claudeChat({
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
    model: OPUS, max_tokens: 1800, timeoutMs: 95000,
    meta: { domain, api: "business-taxonomy", label: "industry" },
  });
  const p = extractJsonObjectLoose(content) || {};
  const industries = uniqStrings(p.industries, 12);
  // a usable result requires at least a few industry options
  if (industries.length < 3) throw new Error("taxonomy: insufficient industry options from model");
  return {
    level: "industry", domain, has_signals: !!signals,
    detected: {
      industry: String(p.detected_industry || industries[0] || "").trim(),
      offering: String(p.detected_offering || "").trim(),
      category: String(p.detected_category || "").trim(),
      business_type: String(p.business_type || "").trim(),
      primary_offering: String(p.primary_offering || "").trim(),
      business_scope: ["Local", "Regional", "National", "International"].includes(p.business_scope) ? p.business_scope : "",
      confidence: typeof p.confidence === "number" ? Math.max(0, Math.min(1, p.confidence)) : 0.4,
    },
    core_services: uniqStrings(p.core_services, 8),
    industries,
    offerings: uniqStrings(p.offerings, 8).length ? uniqStrings(p.offerings, 8) : OFFERING_BASE,
    categories: uniqStrings(p.categories, 14),
  };
}

// ── OFFERING level — Sonnet (no crawl) → offerings for a chosen industry ───────
async function offeringTaxonomy(domain, industry, context) {
  const system = `You are a business-classification expert. Given an industry sector, list the OFFERING TYPES a business in that sector typically provides, for an onboarding dropdown. Return ONLY JSON: {"offerings":["4-8 specific offering types, most common first"]}. Be specific to the industry. Do NOT include "Other".`;
  const user = `Industry sector: ${industry}\nBusiness context (optional): ${context || "none"}\nList the offering types for this sector.`;
  const { content } = await claudeChat({
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
    model: SONNET, max_tokens: 500, timeoutMs: 45000, temperature: 0.3,
    meta: { domain, api: "business-taxonomy", label: "offering" },
  });
  const p = extractJsonObjectLoose(content) || {};
  const offerings = uniqStrings(p.offerings, 8);
  if (!offerings.length) throw new Error("taxonomy: no offerings from model");
  return { level: "offering", domain, industry, offerings };
}

// ── CATEGORY level — Sonnet (no crawl) → categories for industry + offering ────
async function categoryTaxonomy(domain, industry, offering, context) {
  const system = `You are a business-classification expert. Given an industry sector and an offering type, list SPECIFIC service/product categories for an onboarding dropdown. Return ONLY JSON: {"categories":["8-14 specific categories, most relevant first"]}. Be specific (e.g. for Digital Marketing + Services: 'SEO Services','PPC Management','Content Marketing'…). Do NOT include "Other".`;
  const user = `Industry sector: ${industry}\nOffering type: ${offering}\nBusiness context (optional): ${context || "none"}\nList the specific categories.`;
  const { content } = await claudeChat({
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
    model: SONNET, max_tokens: 700, timeoutMs: 45000, temperature: 0.3,
    meta: { domain, api: "business-taxonomy", label: "category" },
  });
  const p = extractJsonObjectLoose(content) || {};
  const categories = uniqStrings(p.categories, 14);
  if (!categories.length) throw new Error("taxonomy: no categories from model");
  return { level: "category", domain, industry, offering, categories };
}

export async function POST(req) {
  let body = {};
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "invalid JSON body" }, { status: 400 }); }
  const domain = cleanDomain(body.domain);
  const level = String(body.level || "industry").toLowerCase();
  if (!domain) return Response.json({ ok: false, error: "domain required" }, { status: 400 });
  if (!String(process.env.ANTHROPIC_API_KEY || "").trim()) return Response.json({ ok: false, error: "analyzer unavailable", fallback: true }, { status: 200 });

  try {
    if (level === "offering") {
      if (!body.industry) return Response.json({ ok: false, error: "industry required" }, { status: 400 });
      const { data, cached } = await getOrFetch({ domain, dataType: `taxo-offering:${slug(body.industry)}`, ttlDays: 30, source: "business-taxonomy", fetchFn: () => offeringTaxonomy(domain, body.industry, body.context) });
      return Response.json({ ok: true, cached, ...data });
    }
    if (level === "category") {
      if (!body.industry || !body.offering) return Response.json({ ok: false, error: "industry and offering required" }, { status: 400 });
      const { data, cached } = await getOrFetch({ domain, dataType: `taxo-category:${slug(body.industry)}:${slug(body.offering)}`, ttlDays: 30, source: "business-taxonomy", fetchFn: () => categoryTaxonomy(domain, body.industry, body.offering, body.context) });
      return Response.json({ ok: true, cached, ...data });
    }
    const { data, cached } = await getOrFetch({ domain, dataType: "taxo-industry", ttlDays: 30, source: "business-taxonomy", fetchFn: () => industryTaxonomy(domain) });
    return Response.json({ ok: true, cached, ...data });
  } catch (e) {
    // soft-fail → the wizard falls back to its built-in lists
    return Response.json({ ok: false, error: String(e?.message || e).slice(0, 200), fallback: true }, { status: 200 });
  }
}
