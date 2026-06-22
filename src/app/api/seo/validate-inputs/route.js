// src/app/api/seo/validate-inputs/route.js
// ─────────────────────────────────────────────────────────────────────────────
// FINAL ACCURACY CHECK — before the report generates, Claude cross-checks the
// Steps 1-5 inputs the user assembled (website, business profile, language/location,
// keywords, competitors) against the REAL website signals, and flags anything that
// looks off. Accurate inputs here = accurate downstream data (GEO/LLM, GMB,
// DataForSEO, Moz, Playwright, Claude analysis), so this is the last guard before
// a costly report run.
//
//   POST /api/seo/validate-inputs
//   body: { websiteData, businessData, languageLocationData, keywordData|selectedKeywords, competitorData }
//   → { ok, verdict, overall_confidence, issues:[{step,field,severity,message,suggestion}],
//       strengths:[], summary }
//
// Read-only + advisory: it NEVER blocks generation. Fails soft to { ok:false } so the
// final step can proceed even if the check is unavailable.
// ─────────────────────────────────────────────────────────────────────────────
import { collectPublicSignals } from "@/lib/perplexity/publicSignals";
import { claudeChat } from "@/lib/claude/client";
import { extractJsonObjectLoose } from "@/lib/perplexity/utils";

export const runtime = "nodejs";
export const maxDuration = 120;

const OPUS = "claude-opus-4-8";
const cleanDomain = (s) => String(s || "").trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/.*$/, "").toLowerCase();
const VERDICTS = ["accurate", "mostly_accurate", "needs_review"];
const SEVERITIES = ["high", "medium", "low"];

// pull a plain keyword-string list out of whatever shape the wizard sends
function keywordList(kw) {
  const arr = Array.isArray(kw) ? kw : Array.isArray(kw?.keywords) ? kw.keywords : Array.isArray(kw?.selected) ? kw.selected : [];
  return arr.map((k) => String(typeof k === "string" ? k : k?.keyword || k?.term || k?.text || k?.name || "").trim()).filter(Boolean).slice(0, 40);
}
function competitorList(cd) {
  const arr = Array.isArray(cd) ? cd : Array.isArray(cd?.competitors) ? cd.competitors : Array.isArray(cd?.businessCompetitors) ? cd.businessCompetitors : [];
  return arr.map((c) => String(typeof c === "string" ? c : c?.name || c?.domain || c?.brand || "").trim()).filter(Boolean).slice(0, 12);
}

export async function POST(req) {
  let body = {};
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "invalid JSON body" }, { status: 400 }); }

  const websiteData = body.websiteData || {};
  const businessData = body.businessData || {};
  const langLoc = body.languageLocationData || {};
  const domain = cleanDomain(websiteData.site || websiteData.domain || body.domain || businessData.domain);
  if (!domain) return Response.json({ ok: false, error: "domain required" }, { status: 400 });
  if (!String(process.env.ANTHROPIC_API_KEY || "").trim()) return Response.json({ ok: false, error: "validator unavailable" }, { status: 200 });

  const keywords = keywordList(body.keywordData || body.selectedKeywords);
  const competitors = competitorList(body.competitorData);

  try {
    const signals = await collectPublicSignals(domain).catch(() => null);
    const hp = signals?.homepage || {};
    const sigText = signals
      ? `Homepage title: ${hp.title || ""}\nHomepage meta: ${hp.metaDescription || ""}\nHomepage snippet: ${String(hp.snippet || "").slice(0, 1400)}\nInternal pages: ${(signals.internalPages || []).slice(0, 3).map((p) => p.title).filter(Boolean).join(" | ")}`
      : "(website signals unavailable — judge from the domain + your own knowledge)";

    const assembled = {
      website: domain,
      business_name: businessData.businessName || null,
      industry: businessData.industry || null,
      offering_type: businessData.offering || null,
      category: businessData.category || null,
      core_services: businessData.coreServices || [],
      revenue_offers: businessData.revenueOffers || null,
      buyer_type: businessData.buyerType || null,
      business_scope: businessData.businessScope || null,
      claude_detected: businessData.detected || null, // what Step-2 analysis detected
      language: langLoc.language || langLoc.lang || null,
      location: langLoc.location || langLoc.country || langLoc.city || null,
      keywords,
      competitors,
    };

    const system = `You are a data-accuracy auditor for an SEO/GEO report platform. The user filled a 5-step onboarding (website, business profile, language/location, keywords, competitors). Cross-check their inputs against the REAL website signals and your own knowledge of the business, and flag anything inaccurate or inconsistent — because every downstream module (GEO/LLM visibility, Google Business Profile, DataForSEO, Moz, Playwright crawl, Claude analysis) depends on these being correct.

Check specifically:
- Does the chosen industry / offering type / category actually match what the website is about?
- Are the selected keywords on-topic for THIS business (flag off-topic or competitor-brand keywords)?
- Are the competitors genuinely in the same space?
- Is the location/language plausible for this business?
- Is the business name plausibly this site's brand?

Return ONLY valid JSON (no markdown):
{
  "verdict": "accurate" | "mostly_accurate" | "needs_review",
  "overall_confidence": 0.0-1.0,
  "summary": "one or two plain-language sentences a non-technical user understands",
  "strengths": ["what is correctly set, short bullets"],
  "issues": [
    {"step": "Business|Keywords|Competition|Location|Website", "field": "industry|category|keywords|...", "severity": "high|medium|low", "message": "what looks off, plainly", "suggestion": "the concrete fix"}
  ]
}
Only raise issues you are reasonably confident about. If everything is consistent, return verdict "accurate" with an empty issues array.`;

    const user = `WEBSITE SIGNALS:\n${sigText}\n\nUSER INPUTS (steps 1-5):\n${JSON.stringify(assembled, null, 2)}\n\nAudit the inputs for accuracy.`;

    const { content } = await claudeChat({
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      model: OPUS, max_tokens: 1600, timeoutMs: 95000,
      meta: { domain, api: "validate-inputs", label: "final-accuracy-check" },
    });
    const p = extractJsonObjectLoose(content) || {};

    const issues = (Array.isArray(p.issues) ? p.issues : []).slice(0, 20).map((it) => ({
      step: String(it?.step || "").trim() || "Business",
      field: String(it?.field || "").trim(),
      severity: SEVERITIES.includes(String(it?.severity || "").toLowerCase()) ? String(it.severity).toLowerCase() : "medium",
      message: String(it?.message || "").trim(),
      suggestion: String(it?.suggestion || "").trim(),
    })).filter((it) => it.message);

    const verdict = VERDICTS.includes(String(p.verdict || "").toLowerCase()) ? String(p.verdict).toLowerCase() : (issues.some((i) => i.severity === "high") ? "needs_review" : issues.length ? "mostly_accurate" : "accurate");

    return Response.json({
      ok: true,
      domain,
      verdict,
      overall_confidence: typeof p.overall_confidence === "number" ? Math.max(0, Math.min(1, p.overall_confidence)) : 0.7,
      summary: String(p.summary || "").trim(),
      strengths: (Array.isArray(p.strengths) ? p.strengths : []).map((s) => String(s || "").trim()).filter(Boolean).slice(0, 10),
      issues,
      counts: { total: issues.length, high: issues.filter((i) => i.severity === "high").length, medium: issues.filter((i) => i.severity === "medium").length, low: issues.filter((i) => i.severity === "low").length },
    });
  } catch (e) {
    return Response.json({ ok: false, error: String(e?.message || e).slice(0, 200) }, { status: 200 });
  }
}
