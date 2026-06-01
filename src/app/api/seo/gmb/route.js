// src/app/api/seo/gmb/route.js
// Checks Google My Business listing and other directory listings via DataForSEO Business Data API.

import { NextResponse } from "next/server";

export const runtime    = "nodejs";
export const maxDuration = 45;

function getDataForSeoAuth() {
  const login    = process.env.DATAFORSEO_LOGIN    || "";
  const password = process.env.DATAFORSEO_PASSWORD || "";
  if (!login || !password) return null;
  return "Basic " + Buffer.from(`${login}:${password}`).toString("base64");
}

async function dfsPost(endpoint, payload, auth) {
  const res = await fetch(`https://api.dataforseo.com/v3/${endpoint}`, {
    method:  "POST",
    headers: {
      Authorization:  auth,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`DataForSEO ${endpoint} → ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

// ── Fetch GMB Info ─────────────────────────────────────────────────────────────
async function fetchGmbInfo(businessName, domain, location = "India", auth) {
  const keyword = businessName || domain;
  try {
    const data = await dfsPost(
      "business_data/google/my_business_info/live",
      [{ keyword, location_name: location, language_code: "en", depth: 1 }],
      auth
    );

    const tasks = data?.tasks || [];
    const task  = tasks[0];
    if (!task || task.status_code !== 20000) return null;

    const items = task?.result?.[0]?.items || [];
    if (items.length === 0) return null;

    const biz = items[0];
    return {
      found: true,
      name:           biz.title || null,
      address:        biz.address || null,
      phone:          biz.phone   || null,
      website:        biz.url     || null,
      category:       biz.category || null,
      rating:         biz.rating?.value ?? null,
      reviewCount:    biz.rating?.votes_count ?? null,
      isVerified:     biz.is_claimed ?? false,
      hoursAvailable: Array.isArray(biz.work_hours?.timetable) && biz.work_hours.timetable.length > 0,
      placeId:        biz.place_id || null,
      cid:            biz.cid || null,
      photos:         biz.main_image ? true : false,
      priceLevel:     biz.price_level || null,
      popularTimes:   biz.popular_times ? true : false,
    };
  } catch (err) {
    console.warn("[gmb] fetchGmbInfo failed:", err?.message);
    return null;
  }
}

// ── Fetch GMB Reviews ─────────────────────────────────────────────────────────
async function fetchGmbReviews(keyword, location = "India", auth) {
  try {
    const data = await dfsPost(
      "business_data/google/reviews/live",
      [{ keyword, location_name: location, language_code: "en", depth: 10, sort_by: "newest" }],
      auth
    );

    const items = data?.tasks?.[0]?.result?.[0]?.items || [];
    return items.slice(0, 5).map((r) => ({
      rating:    r.rating?.value ?? null,
      text:      r.review_text?.slice(0, 300) || null,
      date:      r.timestamp ? r.timestamp.split(" ")[0] : null,
      author:    r.author_title || "Anonymous",
      ownerReply: r.owner_answer ? true : false,
    }));
  } catch (err) {
    console.warn("[gmb] fetchGmbReviews failed:", err?.message);
    return [];
  }
}

// ── Check other directory listings ────────────────────────────────────────────
// We check for common Indian/global directories by searching DataForSEO SERP
// for "business name site:justdial.com OR site:sulekha.com" etc.
async function checkDirectoryListings(domain, auth) {
  const directories = [
    { name: "JustDial",      site: "justdial.com" },
    { name: "Sulekha",       site: "sulekha.com" },
    { name: "IndiaMART",     site: "indiamart.com" },
    { name: "TradeIndia",    site: "tradeindia.com" },
    { name: "Yellow Pages",  site: "yellowpages.com" },
    { name: "Yelp",          site: "yelp.com" },
    { name: "Trustpilot",    site: "trustpilot.com" },
    { name: "Glassdoor",     site: "glassdoor.com" },
  ];

  // Check if domain appears in backlinks from these directories
  try {
    const data = await dfsPost(
      "backlinks/referring_domains/live",
      [{
        target: domain,
        limit: 100,
        filters: ["domain_from", "in", directories.map((d) => d.site)],
      }],
      auth
    );

    const found = new Set();
    const items = data?.tasks?.[0]?.result?.[0]?.items || [];
    for (const item of items) {
      const fromDomain = item.domain_from || "";
      for (const dir of directories) {
        if (fromDomain.includes(dir.site)) found.add(dir.name);
      }
    }

    return directories.map((dir) => ({
      name:  dir.name,
      site:  dir.site,
      listed: found.has(dir.name),
    }));
  } catch {
    // Fallback — return unknown status for all directories
    return directories.map((dir) => ({ name: dir.name, site: dir.site, listed: null }));
  }
}

// ── Main GMB check function ────────────────────────────────────────────────────
export async function checkGmb(domain, businessName = "", location = "India") {
  const auth = getDataForSeoAuth();
  if (!auth) {
    return { error: "DataForSEO credentials not configured", domain };
  }

  const host = String(domain || "").replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  const keyword = businessName || host;

  const [gmbInfo, reviews, directories] = await Promise.allSettled([
    fetchGmbInfo(keyword, host, location, auth),
    fetchGmbReviews(keyword, location, auth),
    checkDirectoryListings(host, auth),
  ]);

  const info = gmbInfo.status === "fulfilled" ? gmbInfo.value : null;
  const revs = reviews.status === "fulfilled" ? reviews.value : [];
  const dirs = directories.status === "fulfilled" ? directories.value : [];

  const listedDirs = dirs.filter((d) => d.listed === true);

  // GMB quality score
  const gmbIssues = [];
  if (!info || !info.found) {
    gmbIssues.push("No Google My Business listing found");
  } else {
    if (!info.isVerified)          gmbIssues.push("GMB listing not verified/claimed");
    if (!info.phone)               gmbIssues.push("Missing phone number on GMB");
    if (!info.address)             gmbIssues.push("Missing address on GMB");
    if (!info.hoursAvailable)      gmbIssues.push("Business hours not set on GMB");
    if (!info.photos)              gmbIssues.push("No photos on GMB");
    if ((info.rating || 0) < 4.0 && (info.reviewCount || 0) > 0)
                                   gmbIssues.push(`Low GMB rating (${info.rating})`);
    if ((info.reviewCount || 0) < 10) gmbIssues.push("Fewer than 10 GMB reviews");
    if (revs.length > 0) {
      const unreplied = revs.filter((r) => !r.ownerReply).length;
      if (unreplied > 0) gmbIssues.push(`${unreplied} recent review(s) without owner reply`);
    }
  }

  if (listedDirs.length < 3) {
    gmbIssues.push(`Listed in only ${listedDirs.length} business directories — aim for 5+`);
  }

  return {
    domain: host,
    gmb: info || { found: false },
    reviews: revs,
    directories: dirs,
    listedDirectoryCount: listedDirs.length,
    issues: gmbIssues,
  };
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function POST(request) {
  try {
    const body = await request.json();
    const { domain, businessName, location } = body;

    if (!domain) {
      return NextResponse.json({ error: "domain is required" }, { status: 400 });
    }

    const result = await checkGmb(domain, businessName || "", location || "India");
    return NextResponse.json(result);
  } catch (err) {
    console.error("[gmb] Error:", err);
    return NextResponse.json({ error: err?.message || "GMB check failed" }, { status: 500 });
  }
}
