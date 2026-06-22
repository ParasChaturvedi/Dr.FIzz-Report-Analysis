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
import { loadGeoSessions } from "@/lib/seo/geo/sessions";
import { generateGeoPrompts } from "@/lib/seo/geo/prompt-generator";
import { buildGeoMetrics, buildShareOfVoice } from "@/lib/seo/doctor-fizz-logic";
import { claudeChat } from "@/lib/claude/client";

// §25 — Claude explains WHY competitors win + what to do; raw metrics come from us.
const GEO_ANALYST_SYS = `You are a senior GEO (Generative Engine Optimization) analyst. You are given a brand's AI-visibility metrics, competitor share-of-voice, and sample AI answers. Explain the competitive picture and what to do. Be specific and grounded ONLY in the data provided — do not invent numbers.
Return ONLY valid JSON:
{"competitor_reasoning":[{"competitor":"...","why":"one sentence on why they out-rank the brand in AI answers"}],"gaps":["the brand's biggest AI-visibility gaps, 2-4 items"],"actions":["3-5 concrete actions to raise the brand's AI visibility — citable pages, sources to earn, topics to cover"],"summary":"2-3 sentence executive read of the brand's AI visibility vs competitors"}`;

export const runtime = "nodejs";
export const maxDuration = 300;

const normDomain = (u) =>
  String(u || "").replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].toLowerCase().trim();
// Brand NAME for Share-of-Voice matching: a competitor passed as a domain
// ("schbang.com") must become "schbang" so it matches "Schbang" in AI prose —
// otherwise competitor SoV is silently understated. A plain name passes through.
const toName = (c) => {
  const s = typeof c === "string" ? c : (c?.name || c?.domain || "");
  const m = String(s).match(/^([a-z0-9-]+)\.[a-z0-9.]{2,}$/i);
  return (m ? m[1] : String(s)).replace(/[-_]+/g, " ").trim();
};

export async function POST(req) {
  let body = {};
  try { body = await req.json(); } catch { /* empty */ }
  const domain = normDomain(body.url || body.domain);
  if (!domain) return Response.json({ geo: null }, { status: 400 });

  // GEO live scan is gated by the same flag as the marketplace scan.
  if (String(process.env.GEO_MARKETPLACE_SOURCE || "").trim().toLowerCase() !== "llm") {
    return Response.json({ geo: null, disabled: true });
  }

  const brand    = body.brand || body.businessName || domain.split(".")[0];
  const industry = body.industry || "";
  const location = body.location || "";
  // §16 — state/city context + global. regionLabel weaves city/state into localized
  // queries; countryCode "global"/"intl"/"" => no residential proxy, un-localized scan.
  const regionLabel = String(body.regionLabel || [body.city, body.state].filter(Boolean).join(", ") || "").trim();
  const ccRaw = String(body.countryCode || "in").trim().toLowerCase();
  const proxyCountry = (ccRaw === "global" || ccRaw === "intl" || ccRaw === "") ? "" : ccRaw;
  const competitors      = (Array.isArray(body.competitors) ? body.competitors : []).map(toName).filter(Boolean).slice(0, 4);
  const competitorDomains = (Array.isArray(body.competitorDomains) && body.competitorDomains.length
    ? body.competitorDomains : competitors).map(normDomain).filter(Boolean).slice(0, 4);
  const competitorPairs = competitors.map((name, i) => ({ name, domain: competitorDomains[i] || "" }));
  const engineKeys = String(process.env.GEO_INLINE_ENGINES || "aioverviews,perplexity,claude")
    .split(",").map((s) => s.trim()).filter(Boolean);

  try {
    const { data, cached } = await getOrFetch({
      domain, dataType: "geo-visibility", ttlDays: 30, source: "geo-scan", fetchedBy: brand,
      fetchFn: async () => {
        // §15/§19 — pull any login-engine session (ChatGPT/Gemini/Copilot) stored
        // server-side (env GEO_SESSION_* or Mongo via /api/seo/geo-session). No-login
        // engines always run; a login engine joins automatically once its session exists.
        const sessions = await loadGeoSessions();
        const allEngines = [...new Set([...engineKeys, ...Object.keys(sessions)])];

        // §17 — semantic-clustered prompts (150-250), Claude-generated from the business
        // signals (cache-miss only). The FULL set is stored for the background job queue;
        // the inline scan runs the top-N by priority (spanning all clusters), sized to a
        // query budget so 6 engines don't blow the 300s limit. The queue collects the rest.
        let generated = [];
        try {
          generated = await generateGeoPrompts({
            industry, category: body.category || "", location, regionLabel,
            keywords: Array.isArray(body.keywords) ? body.keywords : [],
            competitorKeywords: Array.isArray(body.competitorKeywords) ? body.competitorKeywords : [],
            competitors, brand, domain,
            homepageTitle: body.homepageTitle || "", homepageContent: body.homepageContent || "",
            searchIntent: body.searchIntent || "", topicGaps: Array.isArray(body.topicGaps) ? body.topicGaps : [],
          });
        } catch (e) { console.warn("[geo-scan] prompt generation failed:", e?.message); }
        if (!Array.isArray(generated) || !generated.length) {
          generated = (Array.isArray(body.keywords) ? body.keywords : []).slice(0, 20)
            .map((k, i) => ({ prompt: String(k), cluster: "geo", intent: "fallback", neutral: true, priority: i + 1 }));
        }
        const ordered = generated.slice().sort((a, b) => (a.priority || 999) - (b.priority || 999));
        const QUERY_BUDGET = Number(process.env.GEO_INLINE_QUERY_BUDGET || 90);  // inline must finish in 300s; the job queue collects the full 150-250
        const inlineCount = Math.max(8, Math.min(
          Number(process.env.GEO_PROMPT_COUNT || 40),
          Math.floor(QUERY_BUDGET / Math.max(1, allEngines.length))
        ));
        const inline = ordered.slice(0, inlineCount);
        const promptObjs = inline.map((p, i) => ({ id: `gp${i + 1}`, theme: p.cluster || "geo", intent: p.intent || "", neutral: p.neutral !== false, prompt: p.prompt }));

        const scan = await runGeoScan({
          mode: "live", transport: "browserless",
          brand, clientDomain: domain, competitors, competitorDomains,
          industry, location, regionLabel, proxyCountry,
          engineKeys: allEngines, sessions,
          prompts: promptObjs,
        });
        if (!scan?.responses?.length) return null;

        // §25 — ONE Claude deep-analysis pass (cached 30 days with the scan) that
        // explains WHY competitors win + what to do. Raw metrics stay deterministic;
        // Claude only adds the qualitative read. Fail-safe → null on any error.
        let geo_insights = null;
        try {
          const sov = buildShareOfVoice({ brandSet: scan.brandSet, client: brand, responses: scan.responses });
          const metrics = buildGeoMetrics({ brandSet: scan.brandSet, client: brand, clientDomain: domain, competitorDomains: scan.competitorDomains || competitorDomains, responses: scan.responses });
          const ctx = {
            brand, competitors,
            overall: metrics?.overall || null,
            per_engine_sov: (sov?.by_brand || []).map(b => ({ brand: b.brand, is_client: b.is_client, avg: b.avg, per_engine: b.per_engine })),
            sample_answers: scan.responses.slice(0, 8).map(r => ({ engine: r.engine, prompt: r.prompt, lead: r.leadBrand, brands: r.brandsMentioned, cites: (r.citations || []).slice(0, 3) })),
          };
          const { content } = await claudeChat({
            messages: [{ role: "system", content: GEO_ANALYST_SYS }, { role: "user", content: JSON.stringify(ctx) }],
            max_tokens: 1400, temperature: 0.3, meta: { domain, api: "claude-geo-analysis" },
          });
          const m = content.match(/\{[\s\S]*\}/);
          if (m) geo_insights = JSON.parse(m[0]);
        } catch (e) { console.warn("[geo-scan] Claude analysis failed:", e?.message); }

        return {
          responses: scan.responses,
          brandSet: scan.brandSet,
          clientDomain: domain,
          competitorDomains: scan.competitorDomains || competitorDomains,
          competitors: competitorPairs,  // §23 — name+domain pairs for citation attribution
          prompts: inline.map((p) => p.prompt),    // prompts actually run inline this scan
          all_prompts: ordered,          // §17 — full clustered 150-250 set (job queue collects these)
          prompt_clusters: [...new Set(ordered.map((p) => p.cluster).filter(Boolean))],
          engines: allEngines,           // engines actually measured (no-login + login sessions)
          region: proxyCountry || "global",
          geo_insights,                  // §25 Claude deep analysis (why competitors win + actions)
          errors: (scan.errors || []).map((e) => ({ engine: e.engine, error: e.error })),
        };
      },
    });
    return Response.json({ geo: data, cached: Boolean(cached) });
  } catch (e) {
    return Response.json({ geo: null, error: String(e?.message || e).slice(0, 160) }, { status: 200 });
  }
}
