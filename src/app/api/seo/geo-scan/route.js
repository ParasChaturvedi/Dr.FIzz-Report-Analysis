// src/app/api/seo/geo-scan/route.js
// ─────────────────────────────────────────────────────────────────────────────
// GEO / AI-VISIBILITY SCAN — GEO Vision §14-25, Phase 1 foundation.
//
// Runs the multi-engine browser scan (Playwright + Browserless) and returns the RAW
// per-engine responses (brand mentions, lead brand, citations) that the report's
// Section 10 turns into real Share-of-Voice + Citation intelligence — overall AND
// per engine (§20-22).
//
// COST CONTROL: the scan is cached 30 days per domain in MongoDB (getOrFetch), so a
// domain is scanned once per month, not per report. On Vercel only the no-login
// engines run (AI Overview, Perplexity, Claude); ChatGPT/Gemini/Copilot need
// server-side sessions (a later phase). Engines are configurable via GEO_INLINE_ENGINES.
//
// Fail-safe: any error returns { geo: null } so the report falls back to the GEO
// readiness placeholders rather than breaking.
// ─────────────────────────────────────────────────────────────────────────────
import { getOrFetch } from "@/lib/cache/mongo";
import { runGeoScan } from "@/lib/seo/geo/collector";
import { generateGeoPrompts } from "@/lib/seo/geo/prompt-generator";

export const runtime = "nodejs";
export const maxDuration = 300;

const normDomain = (u) =>
  String(u || "").replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].toLowerCase().trim();
const toName = (c) => (typeof c === "string" ? c : c?.name || c?.domain || "");

export async function POST(req) {
  let body = {};
  try { body = await req.json(); } catch { /* empty */ }
  const domain = normDomain(body.url || body.domain);
  if (!domain) return Response.json({ geo: null }, { status: 400 });

  // GEO live scan is gated by the same flag as the marketplace scan.
  if (String(process.env.GEO_MARKETPLACE_SOURCE || "").toLowerCase() !== "llm") {
    return Response.json({ geo: null, disabled: true });
  }

  const brand    = body.brand || body.businessName || domain.split(".")[0];
  const industry = body.industry || "";
  const location = body.location || "";
  const competitors      = (Array.isArray(body.competitors) ? body.competitors : []).map(toName).filter(Boolean).slice(0, 4);
  const competitorDomains = (Array.isArray(body.competitorDomains) && body.competitorDomains.length
    ? body.competitorDomains : competitors).map(normDomain).filter(Boolean).slice(0, 4);
  const engineKeys = String(process.env.GEO_INLINE_ENGINES || "aioverviews,perplexity,claude")
    .split(",").map((s) => s.trim()).filter(Boolean);
  const keywords = Array.isArray(body.keywords) ? body.keywords : [];
  const promptCount = Number(process.env.GEO_PROMPT_COUNT || 20);

  try {
    const { data, cached } = await getOrFetch({
      domain, dataType: "geo-visibility", ttlDays: 30, source: "geo-scan", fetchedBy: brand,
      fetchFn: async () => {
        // §17 — generate brand- & competitor-NEUTRAL prompts (never seed the brand into
        // the query; we measure organic appearance). excludeTerms hard-filters leaks.
        const prompts = await generateGeoPrompts({
          industry, category: body.category || "", location, keywords,
          excludeTerms: [brand, domain, ...competitors, ...competitorDomains],
          count: promptCount,
        });
        const promptObjs = prompts.map((p, i) => ({ id: `gp${i + 1}`, theme: "geo", prompt: p }));

        const scan = await runGeoScan({
          mode: "live", transport: "browserless",
          brand, clientDomain: domain, competitors, competitorDomains,
          industry, location, proxyCountry: body.countryCode || "in",
          engineKeys, sessions: {},
          ...(promptObjs.length ? { prompts: promptObjs } : {}),
        });
        if (!scan?.responses?.length) return null;
        // Store ONLY the raw signal — Section 10 (buildGeoVisibility) computes the
        // proprietary SoV + citation metrics from these, so the math stays in one place.
        return {
          responses: scan.responses,
          brandSet: scan.brandSet,
          clientDomain: domain,
          competitorDomains: scan.competitorDomains || competitorDomains,
          prompts,                       // the neutral prompts actually run (§17)
          engines: engineKeys,
          errors: (scan.errors || []).map((e) => ({ engine: e.engine, error: e.error })),
        };
      },
    });
    return Response.json({ geo: data, cached: Boolean(cached) });
  } catch (e) {
    return Response.json({ geo: null, error: String(e?.message || e).slice(0, 160) }, { status: 200 });
  }
}
