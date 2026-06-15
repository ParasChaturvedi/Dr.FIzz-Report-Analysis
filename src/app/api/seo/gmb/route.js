// src/app/api/seo/gmb/route.js
// Advanced GMB + Local Presence analysis — v2
// Fetches: GMB info, reviews, Q&A, directory listings, competitor GMB,
// review sentiment analysis via Claude, business completeness score.

import { NextResponse } from "next/server";
import { claudeChat }   from "@/lib/claude/client";
import { loadMarketplaceDirectories } from "@/lib/seo/geo/marketplace-source";
import { getOrFetch } from "@/lib/cache/mongo";

export const runtime    = "nodejs";
export const maxDuration = 90;

const DIRECTORIES = [
  { name: "JustDial",      site: "justdial.com",      weight: 3 },
  { name: "Sulekha",       site: "sulekha.com",        weight: 3 },
  { name: "IndiaMART",     site: "indiamart.com",      weight: 3 },
  { name: "TradeIndia",    site: "tradeindia.com",     weight: 2 },
  { name: "Google Maps",   site: "google.com/maps",    weight: 3 },
  { name: "Yelp",          site: "yelp.com",           weight: 2 },
  { name: "Trustpilot",    site: "trustpilot.com",     weight: 3 },
  { name: "Yellow Pages",  site: "yellowpages.com",    weight: 2 },
  { name: "Facebook",      site: "facebook.com",       weight: 2 },
  { name: "Glassdoor",     site: "glassdoor.com",      weight: 1 },
  // B2B / agency review directories (relevant for service & digital businesses)
  { name: "Clutch",        site: "clutch.co",          weight: 3 },
  { name: "GoodFirms",     site: "goodfirms.co",       weight: 2 },
  { name: "G2",            site: "g2.com",             weight: 2 },
  { name: "DesignRush",    site: "designrush.com",     weight: 1 },
];

function getAuth() {
  const l = process.env.DATAFORSEO_LOGIN || "", p = process.env.DATAFORSEO_PASSWORD || "";
  if (!l || !p) return null;
  return "Basic " + Buffer.from(`${l}:${p}`).toString("base64");
}

async function dfsPost(endpoint, payload, auth) {
  const res = await fetch(`https://api.dataforseo.com/v3/${endpoint}`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`DFS ${endpoint} → ${res.status}`);
  return res.json();
}

// Build a progressive list of name variants, most-specific → least-specific.
// e.g. "Itzfizz Digital Private Limited" →
//   ["Itzfizz Digital Private Limited", "Itzfizz Digital Pvt Ltd",
//    "Itzfizz Digital", "Itzfizz"]
// This is exported so the variant set is testable and reused.
export function gmbNameVariants(rawName) {
  const name = String(rawName || "").trim();
  if (!name) return [];
  const titled = (s) => s.replace(/\b\w/g, c => c.toUpperCase());
  // Strip only formal legal-entity suffixes (NOT "co/corp/company" — those are
  // usually part of the brand). Trailing-only so mid-name words are preserved.
  const stripped = name
    .replace(/[\s,]+(private\s+limited|pvt\.?\s*ltd\.?|p\.?\s*ltd\.?|limited|ltd\.?|inc\.?|incorporated|llc|llp)\.?\s*$/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  const words = stripped.split(/\s+/).filter(Boolean);
  const variants = [
    name,                                   // full as entered
    titled(name),                           // Title Case full
    stripped,                               // legal suffix removed → "Itzfizz Digital"
    titled(stripped),
    words.slice(0, 3).join(" "),            // first 3 significant words
    words.slice(0, 2).join(" "),            // first 2 → "Itzfizz Digital"
    words[0],                               // first word → "Itzfizz"
  ];
  // Dedupe (case-insensitive), drop empties and 1-char tokens.
  const seen = new Set();
  const out = [];
  for (const v of variants) {
    const t = String(v || "").trim();
    if (t.length < 2) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

// ── GMB Info — tries multiple keyword variants to maximise hit rate ───────────
async function fetchGmbInfo(keyword, location, auth) {
  // Progressive variants: full → suffix-stripped → first-2-words → first word.
  const variants = gmbNameVariants(keyword);

  for (const kw of variants) {
    try {
      const data = await dfsPost(
        "business_data/google/my_business_info/live",
        [{ keyword: kw, location_name: location, language_code: "en", depth: 1 }],
        auth
      );
      const items = data?.tasks?.[0]?.result?.[0]?.items || [];
      if (!items.length) continue; // try next variant
      const b = items[0];

      return {
        found: true,
        keywordUsed:    kw,
        name:           b.title || null,
        address:        b.address || null,
        phone:          b.phone  || null,
        website:        b.url    || null,
        category:       b.category || null,
        additionalCategories: b.additional_categories || [],
        rating:         b.rating?.value ?? null,
        reviewCount:    b.rating?.votes_count ?? null,
        isVerified:     b.is_claimed ?? false,
        hoursAvailable: Array.isArray(b.work_hours?.timetable) && b.work_hours.timetable.length > 0,
        hoursDetail:    b.work_hours?.timetable || null,
        placeId:        b.place_id || null,
        cid:            b.cid || null,
        hasPhotos:      b.main_image ? true : false,
        totalPhotos:    b.photos_count ?? null,
        priceLevel:     b.price_level || null,
        popularTimes:   b.popular_times ? true : false,
        attributes:     Array.isArray(b.attributes) ? b.attributes.slice(0, 10) : [],
        serpRank:       b.rank || null,
      };
    } catch (err) {
      console.warn(`[gmb] fetchGmbInfo kw="${kw}":`, err?.message);
    }
  }
  return null; // all variants exhausted
}

// ── GMB via Google Maps SERP (FALLBACK) ───────────────────────────────────────
// my_business_info needs a tight keyword+location match and can miss local
// businesses when the location is country-level. The Maps SERP is what actually
// powers the knowledge panel — searching it by name reliably surfaces the
// listing (rating, reviews, address, phone) even for a city-level business.
async function fetchGmbViaMaps(keyword, location, auth) {
  const variants = gmbNameVariants(keyword);
  const hostWords = variants.map(v => v.toLowerCase());
  for (const kw of variants) {
    try {
      const data = await dfsPost(
        "serp/google/maps/live/advanced",
        [{ keyword: kw, location_name: location, language_code: "en", depth: 10 }],
        auth
      );
      const items = data?.tasks?.[0]?.result?.[0]?.items || [];
      const maps = items.filter(i => i.type === "maps_search" || i.type === "local_pack" || i.title);
      if (!maps.length) continue;
      // Pick the result whose title best matches the searched name.
      const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
      const target = norm(variants[0]);
      const firstWord = target.split(" ")[0];
      let b = maps.find(m => norm(m.title) === target)
           || maps.find(m => norm(m.title).includes(firstWord))
           || maps[0];
      if (!b) continue;

      return {
        found: true,
        keywordUsed:    kw,
        source:         "maps_serp",
        name:           b.title || null,
        address:        b.address || b.address_info?.address || null,
        phone:          b.phone || null,
        website:        b.url || b.domain || null,
        category:       b.category || (Array.isArray(b.category_ids) ? b.category_ids[0] : null) || null,
        additionalCategories: b.additional_categories || [],
        rating:         b.rating?.value ?? null,
        reviewCount:    b.rating?.votes_count ?? b.rating?.reviews_count ?? null,
        isVerified:     b.is_claimed ?? true,           // appearing in Maps ⇒ effectively live
        hoursAvailable: !!(b.work_hours?.timetable || b.work_time),
        hoursDetail:    b.work_hours?.timetable || null,
        placeId:        b.place_id || null,
        cid:            b.cid || null,
        hasPhotos:      b.main_image ? true : !!b.total_photos,
        totalPhotos:    b.total_photos ?? null,
        latitude:       b.latitude ?? null,
        longitude:      b.longitude ?? null,
        attributes:     Array.isArray(b.attributes) ? b.attributes.slice(0, 10) : [],
        serpRank:       b.rank_absolute || b.rank_group || null,
      };
    } catch (err) {
      console.warn(`[gmb] fetchGmbViaMaps kw="${kw}":`, err?.message);
    }
  }
  return null;
}

// ── GMB Reviews ───────────────────────────────────────────────────────────────
async function fetchGmbReviews(keyword, location, auth) {
  try {
    const data = await dfsPost(
      "business_data/google/reviews/live",
      [{ keyword, location_name: location, language_code: "en", depth: 20, sort_by: "newest" }],
      auth
    );
    const items = data?.tasks?.[0]?.result?.[0]?.items || [];
    return items.map(r => ({
      rating:      r.rating?.value ?? null,
      text:        (r.review_text || "").slice(0, 500),
      date:        r.timestamp ? r.timestamp.split(" ")[0] : null,
      author:      r.author_title || "Anonymous",
      ownerReply:  !!(r.owner_answer),
      replyText:   r.owner_answer?.slice(0, 200) || null,
      helpful:     r.helpful_votes ?? 0,
    }));
  } catch { return []; }
}

// ── GMB Q&A ───────────────────────────────────────────────────────────────────
async function fetchGmbQA(keyword, location, auth) {
  try {
    const data = await dfsPost(
      "business_data/google/questions_and_answers/live",
      [{ keyword, location_name: location, language_code: "en", depth: 10 }],
      auth
    );
    const items = data?.tasks?.[0]?.result?.[0]?.items || [];
    return items.slice(0, 10).map(q => ({
      question:    (q.question_text || "").slice(0, 200),
      hasAnswer:   !!(q.answers?.length),
      answerCount: q.answers?.length || 0,
      date:        q.question_timestamp?.split(" ")[0] || null,
    }));
  } catch { return []; }
}

// ── Directory Listings — SERP-based search with name matching ─────────────────
// Strategy: for each directory, search Google for:
//   "<businessName>" site:<directoryDomain>
// Then verify the result actually mentions the business name or domain.
// Falls back to backlinks if SERP quota is tight.
async function checkDirectoryListings(domain, auth, businessName = "") {
  const host = domain.replace(/^https?:\/\//,"").replace(/^www\./,"").split("/")[0];

  // Search name variants — CLEAN brand (no legal suffix) FIRST. We never assume a
  // "Private Limited / Pvt Ltd / LLP / Inc / LLC / Ltd" suffix the user didn't
  // enter, and a suffix-free brand matches directory listings more reliably.
  const stripLegal = (s) => String(s || "")
    .replace(/[\s,]+(private\s+limited|pvt\.?\s*ltd\.?|p\.?\s*ltd\.?|limited|ltd\.?|inc\.?|incorporated|llc|llp)\.?\s*$/gi, "")
    .replace(/\s{2,}/g, " ").trim();
  const nameVariants = [...new Set([
    stripLegal(businessName) || businessName,  // clean brand first
    businessName,                              // full, as entered
    host.split(".")[0],                        // host brand
  ].filter(Boolean))].slice(0, 3);

  const primaryName = nameVariants[0] || host.split(".")[0];

  // Search one directory via Google SERP
  async function searchOneDir(dir) {
    const siteRoot = dir.site.split("/")[0];
    try {
      // Try each name variant — stop at first hit
      for (const name of nameVariants) {
        const query = `"${name}" site:${siteRoot}`;
        const data = await dfsPost(
          "serp/google/organic/live/advanced",
          [{
            keyword:       query,
            location_name: "India",
            language_code: "en",
            device:        "desktop",
            depth:         5,
          }],
          auth
        );
        const items = data?.tasks?.[0]?.result?.[0]?.items || [];
        const organic = items.filter(i => i.type === "organic");
        if (!organic.length) continue;

        // Verify the top result actually relates to this business
        const top = organic[0];
        const resultUrl  = String(top.url || "").toLowerCase();
        const resultTitle= String(top.title || "").toLowerCase();
        const resultDesc = String(top.description || "").toLowerCase();
        const nameLC     = name.toLowerCase();
        const hostLC     = host.toLowerCase();

        // Accept if result URL contains the directory domain AND
        // title/description/url mentions the business name or domain
        const urlMatchesDir  = resultUrl.includes(siteRoot.split(".")[0]);
        const mentionsBiz    = resultTitle.includes(nameLC) ||
                               resultDesc.includes(nameLC)  ||
                               resultUrl.includes(hostLC)   ||
                               // also try short name (first word)
                               resultTitle.includes(nameLC.split(" ")[0]) ||
                               resultDesc.includes(nameLC.split(" ")[0]);

        if (urlMatchesDir && mentionsBiz) {
          return {
            name:    dir.name,
            site:    dir.site,
            weight:  dir.weight,
            listed:  true,
            listingUrl: top.url || null,
            matchedAs: name,
          };
        }
      }
      // Results found but none matched business name — not listed
      return { name: dir.name, site: dir.site, weight: dir.weight, listed: false, listingUrl: null };
    } catch (err) {
      console.warn(`[gmb] dir check ${dir.name}:`, err?.message);
      return { name: dir.name, site: dir.site, weight: dir.weight, listed: null, listingUrl: null };
    }
  }

  // Run all 10 directory checks in parallel
  const results = await Promise.all(DIRECTORIES.map(dir => searchOneDir(dir)));
  return results;
}

// ── Review Velocity ───────────────────────────────────────────────────────────
function computeReviewVelocity(reviews) {
  if (reviews.length < 2) return null;
  const dated = reviews.filter(r => r.date).sort((a,b) => new Date(b.date) - new Date(a.date));
  if (dated.length < 2) return null;
  const newest = new Date(dated[0].date);
  const oldest = new Date(dated[dated.length - 1].date);
  const days   = Math.max(1, (newest - oldest) / (1000 * 60 * 60 * 24));
  return Math.round((dated.length / days) * 30 * 10) / 10; // reviews per month
}

// ── Review Sentiment (Claude) ─────────────────────────────────────────────────
async function analyzeReviewSentiment(reviews) {
  if (!reviews.length || !process.env.ANTHROPIC_API_KEY) return null;
  const sample = reviews.slice(0, 10).map((r, i) =>
    `Review ${i+1} (${r.rating}★): "${(r.text || "").slice(0, 200)}"`
  ).join("\n");

  try {
    const { content } = await claudeChat({
      messages: [{
        role: "system",
        content: "Analyse these customer reviews and return ONLY valid JSON with no other text: { \"topPraises\": [string, string, string], \"topComplaints\": [string, string], \"overallSentiment\": \"positive|mixed|negative\", \"sentimentScore\": 0-100, \"urgentIssues\": [string] }"
      }, {
        role: "user",
        content: `Analyse these reviews:\n${sample}\n\nReturn ONLY the JSON object.`
      }],
      max_tokens: 500,
      temperature: 0.1,
    });

    const match = content.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    return null;
  } catch { return null; }
}

// ── Business Completeness Score ────────────────────────────────────────────────
function computeCompletenessScore(info, reviews, qa, directories) {
  if (!info?.found) return { score: 0, maxScore: 100, breakdown: [] };

  const checks = [
    { label: "GMB Listing Exists",       score: 15, pass: info.found },
    { label: "Listing Verified/Claimed", score: 15, pass: info.isVerified },
    { label: "Phone Number",             score: 8,  pass: !!info.phone },
    { label: "Address",                  score: 8,  pass: !!info.address },
    { label: "Business Hours",           score: 8,  pass: info.hoursAvailable },
    { label: "Photos/Images",            score: 8,  pass: info.hasPhotos },
    { label: "Has Reviews",              score: 5,  pass: (reviews.length > 0) },
    { label: "Rating ≥ 4.0",             score: 8,  pass: (info.rating||0) >= 4.0 },
    { label: "10+ Reviews",              score: 5,  pass: (info.reviewCount||0) >= 10 },
    { label: "Replies to Reviews",       score: 5,  pass: reviews.some(r => r.ownerReply) },
    { label: "Q&A Answered",             score: 5,  pass: qa.some(q => q.hasAnswer) },
    { label: "Listed in 3+ Directories", score: 10, pass: (directories.filter(d => d.listed).length >= 3) },
  ];

  const earned = checks.filter(c => c.pass).reduce((s, c) => s + c.score, 0);
  const max    = checks.reduce((s, c) => s + c.score, 0);
  return {
    score:     Math.round((earned / max) * 100),
    maxScore:  100,
    earned,
    breakdown: checks,
  };
}

// ── Extract business name from homepage HTML ──────────────────────────────────
async function extractBusinessName(host) {
  try {
    const r = await fetch(`https://${host}`, {
      signal: AbortSignal.timeout(12000),
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!r.ok) return null;
    const html = await r.text();

    // 1. og:site_name — most reliable for business names
    const ogName =
      html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']{2,80})["']/i)?.[1]?.trim() ||
      html.match(/<meta[^>]+content=["']([^"']{2,80})["'][^>]+property=["']og:site_name["']/i)?.[1]?.trim();
    if (ogName) return ogName;

    // 2. application-name meta tag
    const appName =
      html.match(/<meta[^>]+name=["']application-name["'][^>]+content=["']([^"']{2,80})["']/i)?.[1]?.trim() ||
      html.match(/<meta[^>]+content=["']([^"']{2,80})["'][^>]+name=["']application-name["']/i)?.[1]?.trim();
    if (appName) return appName;

    // 3. Schema.org Organization/LocalBusiness name
    const schemaMatch = html.match(/"@type"\s*:\s*"(?:Organization|LocalBusiness|Corporation)"[^}]{0,500}"name"\s*:\s*"([^"]{2,80})"/i) ||
                        html.match(/"name"\s*:\s*"([^"]{2,80})"[^}]{0,200}"@type"\s*:\s*"(?:Organization|LocalBusiness)"/i);
    if (schemaMatch?.[1]) return schemaMatch[1].trim();

    // 4. Title tag first segment before |, -, :, »
    const titleFull = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
    const title = titleFull ? titleFull.split(/\s*[-|:–»]\s*/)[0].trim() : null;
    if (title && title.length >= 2 && title.length <= 60) return title;

    return null;
  } catch (err) {
    console.warn("[gmb] extractBusinessName:", err?.message);
    return null;
  }
}

// ── Main check function ───────────────────────────────────────────────────────
export async function checkGmb(domain, businessName = "", location = "India", opts = {}) {
  const auth = getAuth();
  if (!auth) return { error: "DataForSEO credentials not configured", domain };

  const host = String(domain||"").replace(/^https?:\/\//,"").replace(/^www\./,"").split("/")[0];

  // Resolve best keyword for GMB lookup: provided name → extracted from HTML → domain prefix
  let keyword = businessName;
  if (!keyword) {
    const extracted = await extractBusinessName(host);
    keyword = extracted || host.split(".")[0];
  }

  // 1) Find the listing: my_business_info (each name variant) → Maps SERP
  //    fallback (more reliable for city-level businesses). 2) Then fetch reviews,
  //    Q&A and directories under the EXACT name that matched.
  let info = await fetchGmbInfo(keyword, location, auth).catch(() => null);
  if (!info?.found) {
    const viaMaps = await fetchGmbViaMaps(keyword, location, auth).catch(() => null);
    if (viaMaps?.found) info = viaMaps;
  }
  const matchedKeyword = info?.keywordUsed || info?.name || keyword;

  const [reviewRes, qaRes, dirRes] = await Promise.allSettled([
    info?.found ? fetchGmbReviews(matchedKeyword, location, auth) : Promise.resolve([]),
    info?.found ? fetchGmbQA(matchedKeyword, location, auth)      : Promise.resolve([]),
    // Competitors skip the ~14-call directory SERP fan-out (not shown in the
    // competitor comparison) → saves DataForSEO credits. Client gets full data.
    opts.skipDirectories
      ? Promise.resolve(DIRECTORIES.map((d) => ({ ...d, listed: null, listingUrl: null })))
      // Prefer the multi-LLM Marketplace Intelligence (cross-LLM-validated, cached);
      // falls back to DataForSEO SERP detection when the flag is off / no cache.
      : loadMarketplaceDirectories({ domain: host, businessName: matchedKeyword, location })
          .then((llm) => llm || checkDirectoryListings(host, auth, matchedKeyword)),
  ]);

  const reviews = reviewRes.status === "fulfilled" ? reviewRes.value : [];
  const qa      = qaRes.status     === "fulfilled" ? qaRes.value     : [];
  const dirs    = dirRes.status    === "fulfilled" ? dirRes.value    : DIRECTORIES.map(d => ({ ...d, listed: null }));

  // Review analytics
  const reviewVelocity = computeReviewVelocity(reviews);
  const unrepliedCount = reviews.filter(r => !r.ownerReply).length;
  const ratingDist     = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  for (const r of reviews) { if (r.rating >= 1 && r.rating <= 5) ratingDist[r.rating]++; }

  // Sentiment (async, non-blocking)
  const sentiment = await analyzeReviewSentiment(reviews).catch(() => null);

  // Completeness score
  const completeness = computeCompletenessScore(info, reviews, qa, dirs);

  // Issues
  const issues = [];
  if (!info?.found) {
    issues.push({ severity: "critical", issue: "No Google My Business listing found" });
  } else {
    if (!info.isVerified)           issues.push({ severity: "critical", issue: "GMB listing not verified/claimed" });
    if (!info.phone)                issues.push({ severity: "high",     issue: "Missing phone number on GMB" });
    if (!info.address)              issues.push({ severity: "high",     issue: "Missing address on GMB" });
    if (!info.hoursAvailable)       issues.push({ severity: "medium",   issue: "Business hours not set" });
    if (!info.hasPhotos)            issues.push({ severity: "medium",   issue: "No photos uploaded to GMB" });
    if ((info.rating||0) < 4.0 && (info.reviewCount||0) > 5)
                                    issues.push({ severity: "high",     issue: `Low GMB rating (${info.rating}/5)` });
    if ((info.reviewCount||0) < 10) issues.push({ severity: "medium",   issue: "Fewer than 10 reviews — build social proof" });
    if (unrepliedCount > 0)         issues.push({ severity: "medium",   issue: `${unrepliedCount} review(s) without owner reply` });
  }

  const listedCount  = dirs.filter(d => d.listed === true).length;
  if (listedCount < 3)              issues.push({ severity: "high", issue: `Only ${listedCount} directory listings (target: 5+)` });

  const unansweredQA = qa.filter(q => !q.hasAnswer).length;
  if (unansweredQA > 0)             issues.push({ severity: "low",  issue: `${unansweredQA} unanswered Q&A on GMB` });

  const variantsTried = gmbNameVariants(keyword);
  console.log(`[gmb] domain=${host} input="${keyword}" matched="${info?.keywordUsed || "-"}" found=${!!info?.found} variants=[${variantsTried.join(" | ")}] dirs=${listedCount}`);

  return {
    domain:         host,
    searchedAs:     info?.keywordUsed || keyword,   // the variant that matched
    variantsTried,                                  // ← debug: all names searched
    gmb:            info || { found: false },
    reviews:        reviews.slice(0, 10),
    reviewCount:    reviews.length,
    reviewVelocity,
    unrepliedReviewCount: unrepliedCount,
    ratingDistribution: ratingDist,
    sentiment,
    qa:             qa.slice(0, 8),
    directories:    dirs,
    listedDirectoryCount: listedCount,
    completeness,
    issues,
    issueCount: issues.length,
    criticalCount: issues.filter(i => i.severity === "critical").length,
  };
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function POST(request) {
  try {
    const body = await request.json();
    const { domain, businessName, location, skipDirectories } = body;
    if (!domain) return NextResponse.json({ error: "domain required" }, { status: 400 });
    // 30-day persistent cache by domain (cross-user reuse: a competitor that matches
    // an already-checked domain reuses its GMB data). No-op if Mongo isn't configured.
    const { data: result } = await getOrFetch({
      domain,
      dataType: `gmb:${skipDirectories ? "nodirs" : "full"}`,
      ttlDays: 30,
      source: "gmb",
      fetchFn: () => checkGmb(domain, businessName || "", location || "India", { skipDirectories: !!skipDirectories }),
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[gmb] Error:", err);
    return NextResponse.json({ error: err?.message || "GMB check failed" }, { status: 500 });
  }
}
