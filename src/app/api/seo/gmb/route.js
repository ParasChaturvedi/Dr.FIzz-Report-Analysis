// src/app/api/seo/gmb/route.js
// Advanced GMB + Local Presence analysis — v2
// Fetches: GMB info, reviews, Q&A, directory listings, competitor GMB,
// review sentiment analysis via Claude, business completeness score.

import { NextResponse } from "next/server";
import { claudeChat }   from "@/lib/claude/client";

export const runtime    = "nodejs";
export const maxDuration = 60;

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

// ── GMB Info ──────────────────────────────────────────────────────────────────
async function fetchGmbInfo(keyword, location, auth) {
  try {
    const data = await dfsPost(
      "business_data/google/my_business_info/live",
      [{ keyword, location_name: location, language_code: "en", depth: 1 }],
      auth
    );
    const items = data?.tasks?.[0]?.result?.[0]?.items || [];
    if (!items.length) return null;
    const b = items[0];

    return {
      found: true,
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
    console.warn("[gmb] fetchGmbInfo:", err?.message);
    return null;
  }
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

// ── Directory Listings ────────────────────────────────────────────────────────
async function checkDirectoryListings(domain, auth) {
  try {
    const data = await dfsPost(
      "backlinks/referring_domains/live",
      [{ target: domain, limit: 200 }],
      auth
    );
    const items = data?.tasks?.[0]?.result?.[0]?.items || [];
    const fromDomains = items.map(i => i.domain_from || "");

    return DIRECTORIES.map(dir => ({
      name:   dir.name,
      site:   dir.site,
      weight: dir.weight,
      listed: fromDomains.some(d => d.includes(dir.site.split("/")[0])),
    }));
  } catch {
    return DIRECTORIES.map(d => ({ name: d.name, site: d.site, weight: d.weight, listed: null }));
  }
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

// ── Main check function ───────────────────────────────────────────────────────
export async function checkGmb(domain, businessName = "", location = "India") {
  const auth = getAuth();
  if (!auth) return { error: "DataForSEO credentials not configured", domain };

  const host    = String(domain||"").replace(/^https?:\/\//,"").replace(/^www\./,"").split("/")[0];
  const keyword = businessName || host;

  // Run all fetches in parallel
  const [gmbRes, reviewRes, qaRes, dirRes] = await Promise.allSettled([
    fetchGmbInfo(keyword, location, auth),
    fetchGmbReviews(keyword, location, auth),
    fetchGmbQA(keyword, location, auth),
    checkDirectoryListings(host, auth),
  ]);

  const info    = gmbRes.status    === "fulfilled" ? gmbRes.value    : null;
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

  return {
    domain:         host,
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
    const { domain, businessName, location } = body;
    if (!domain) return NextResponse.json({ error: "domain required" }, { status: 400 });
    const result = await checkGmb(domain, businessName || "", location || "India");
    return NextResponse.json(result);
  } catch (err) {
    console.error("[gmb] Error:", err);
    return NextResponse.json({ error: err?.message || "GMB check failed" }, { status: 500 });
  }
}
