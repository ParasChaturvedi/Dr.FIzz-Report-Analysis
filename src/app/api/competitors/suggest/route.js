import { NextResponse } from "next/server";
import { getSiteProfile, getKeywordsFromProfile, getCompetitorsFromProfile } from "@/lib/claude/pipeline";
import { normalizeHost } from "@/lib/perplexity/utils";
import { fetchCompetitorDomains } from "@/lib/seo/dataforseo";
import { classifyEntityType } from "@/lib/seo/doctor-fizz-logic";

export const runtime = "nodejs";

function buildLocation({ location, city, state, country }) {
  const direct = String(location || "").trim();
  if (direct) return direct;
  return [city, state, country].map((x) => String(x || "").trim()).filter(Boolean).join(", ");
}

function makeKey(domain, industry, location) {
  return [domain || "", industry || "", location || ""]
    .map((x) => String(x || "").trim().toLowerCase())
    .join("|");
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));

    const domain = normalizeHost(body?.domain || body?.site || body?.url || "");
    if (!domain) return NextResponse.json({ error: "Missing domain" }, { status: 400 });

    const industry = String(body?.industry || "").trim();
    const location = buildLocation({
      location: body?.location,
      city: body?.city,
      state: body?.state,
      country: body?.country,
    });

    const cacheKey = makeKey(domain, industry, location);

    const seedFromReq = Array.isArray(body?.seedKeywords) ? body.seedKeywords : [];
    const seedKeywords = seedFromReq.map((x) => String(x || "").trim()).filter(Boolean).slice(0, 12);

    const { profile, signals } = await getSiteProfile({
      input: domain,
      industry,
      location,
      cacheKey,
    });

    let finalSeeds = seedKeywords;
    if (!finalSeeds.length) {
      const kw = await getKeywordsFromProfile({ profile, signals, location, cacheKey });
      finalSeeds = (kw?.keywords || []).slice(0, 8);
    }

    // Fetch Claude-derived competitors and DataForSEO SERP-based competitors in parallel
    const [comp, dfsCompetitors] = await Promise.all([
      getCompetitorsFromProfile({
        profile,
        signals,
        seedKeywords: finalSeeds,
        cacheKey,
      }),
      fetchCompetitorDomains(domain).catch(() => []),
    ]);

    // DataForSEO competitor domains take priority as they're based on real SERP data.
    // Merge: DataForSEO domains first, then Claude suggestions that aren't already present.
    const dfsSearchDomains = (dfsCompetitors || [])
      .map((c) => String(c?.domain || "").toLowerCase().trim())
      .filter(Boolean);

    const claudeSearchDomains = (comp.searchCompetitors || [])
      .map((x) => String(x).toLowerCase().trim())
      .filter(Boolean);

    // RC4/3.2 — route Claude's business list through the SAME entity-type classifier the report
    // benchmark uses: software vendors (xero/sage), professional bodies (icaew), trade publishers
    // (accountingweb) and directories rank for these queries but are SEARCH competitors, not business
    // rivals. Keep only real rivals (+ 'unresolved' — never drop a real one on uncertainty) in the
    // business bucket; move the rest into search so Step 4 shows them cleanly separated.
    const _rawBiz = comp.businessCompetitors || [];
    const bizKept = [];
    const bizToSearch = [];
    for (const c of _rawBiz) {
      const t = classifyEntityType(c);
      if (t === "business_competitor" || t === "unresolved") bizKept.push(c);
      else bizToSearch.push(String(c).toLowerCase().trim());
    }

    const claudeBizDomains = bizKept
      .map((x) => String(x).toLowerCase().trim())
      .filter(Boolean);

    // Build merged search competitors: DataForSEO first, then Claude search additions, then the
    // reclassified non-business entities pulled out of the business list.
    const mergedSearchSet = new Set(dfsSearchDomains);
    for (const d of claudeSearchDomains) {
      mergedSearchSet.add(d);
    }
    for (const d of bizToSearch) { if (d) mergedSearchSet.add(d); }
    const bizSet = new Set(claudeBizDomains);

    // Remove business competitors from search list to avoid duplicates
    const searchFiltered = [...mergedSearchSet].filter(
      (x) => !bizSet.has(x) && x !== domain.toLowerCase()
    );

    return NextResponse.json(
      {
        domain: comp.domain,
        businessCompetitors: bizKept,
        searchCompetitors: searchFiltered,
        buckets: comp.buckets || {},
        profile: {
          businessType: profile.businessType,
          industry: profile.industry,
          primaryOffering: profile.primaryOffering,
          geoFocus: profile.geoFocus,
        },
        _sources: {
          dataforseo: dfsSearchDomains.length,
          claude: claudeSearchDomains.length,
        },
      },
      { status: 200 }
    );
  } catch (e) {
    return NextResponse.json({ error: e?.message || "Competitor suggest failed" }, { status: 500 });
  }
}
