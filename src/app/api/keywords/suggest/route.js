import { NextResponse } from "next/server";
import { getSiteProfile, getKeywordsFromProfile } from "@/lib/claude/pipeline";
import { normalizeHost } from "@/lib/perplexity/utils";

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

    const { profile, signals } = await getSiteProfile({
      input: domain,
      industry,
      location,
      cacheKey,
    });

    const kw = await getKeywordsFromProfile({
      profile,
      signals,
      location,
      cacheKey,
    });

    return NextResponse.json(
      {
        domain: profile.domain,
        keywords: kw.keywords || [],
        clusters: kw.clusters || [],
        profile: {
          businessType: profile.businessType,
          industry: profile.industry,
          primaryOffering: profile.primaryOffering,
          geoFocus: profile.geoFocus,
        },
      },
      { status: 200 }
    );
  } catch (e) {
    return NextResponse.json({ error: e?.message || "Keyword suggest failed" }, { status: 500 });
  }
}
