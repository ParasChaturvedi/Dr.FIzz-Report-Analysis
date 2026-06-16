// src/app/api/seo/info-stats/route.js
// ─────────────────────────────────────────────────────────────────────────────
// Lightweight, 30-day-cached stats for the left Info panel: Domain Authority (Moz),
// Organic Traffic + Organic Keywords (DataForSEO domain overview). Same cache logic
// as the rest of the app — 1st time fetches live + stores in MongoDB, then every
// request within 30 days is served from MongoDB (no re-fetch). Fail-safe: any error
// returns infoPanel:null so the panel falls back to its placeholder.
// ─────────────────────────────────────────────────────────────────────────────
import { getOrFetch } from "@/lib/cache/mongo";
import { fetchDomainRankOverview } from "@/lib/seo/dataforseo";
import { fetchMozMetrics } from "@/lib/seo/moz/client";

export const runtime = "nodejs";
export const maxDuration = 60;

const normDomain = (u) =>
  String(u || "").replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].toLowerCase().trim();

export async function POST(req) {
  let body = {};
  try { body = await req.json(); } catch { /* empty body */ }
  const domain = normDomain(body.url || body.domain);
  if (!domain) return Response.json({ infoPanel: null }, { status: 400 });

  try {
    const { data, cached } = await getOrFetch({
      domain,
      dataType: "info-stats",
      ttlDays: 30,
      source: "info-panel",
      fetchFn: async () => {
        // DA from Moz (accurate); traffic + keywords from DataForSEO. Both are also
        // independently cached by their own layers, so this is cheap on repeats.
        const [rank, moz] = await Promise.all([
          fetchDomainRankOverview(domain).catch(() => null),
          fetchMozMetrics(domain, { withList: false }).catch(() => null),
        ]);
        const domainAuthority =
          Number.isFinite(moz?.domainAuthority) ? Math.round(moz.domainAuthority)
          : Number.isFinite(moz?.backlinksSummary?.rank) ? Math.round(moz.backlinksSummary.rank)
          : null;
        const organicTraffic = Number.isFinite(rank?.organicTraffic) ? Math.round(rank.organicTraffic) : null;
        const organicKeyword = Number.isFinite(rank?.organicKeywords) ? Math.round(rank.organicKeywords) : null;
        return { domainAuthority, organicTraffic, organicKeyword, badge: { label: "Good", tone: "success" } };
      },
    });
    return Response.json({ infoPanel: data, cached: Boolean(cached) });
  } catch (e) {
    return Response.json({ infoPanel: null, error: String(e?.message || e).slice(0, 160) }, { status: 200 });
  }
}
