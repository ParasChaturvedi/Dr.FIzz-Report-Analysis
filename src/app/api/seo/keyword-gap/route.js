// src/app/api/seo/keyword-gap/route.js
// Finds keywords competitors rank for but the target domain doesn't.
// Also pulls People Also Ask questions from SERP for target keywords.
// Uses DataForSEO: keywords_for_site, ranked_keywords, serp/google/organic.

import { NextResponse } from "next/server";
import { getCached, putCached } from "@/lib/cache/mongo";
import { logUsage } from "@/lib/cache/usage";

export const runtime    = "nodejs";
export const maxDuration = 60;

function getAuth() {
  const login    = process.env.DATAFORSEO_LOGIN    || "";
  const password = process.env.DATAFORSEO_PASSWORD || "";
  if (!login || !password) return null;
  return "Basic " + Buffer.from(`${login}:${password}`).toString("base64");
}

async function dfsPost(endpoint, payload, auth) {
  const res = await fetch(`https://api.dataforseo.com/v3/${endpoint}`, {
    method:  "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body:    JSON.stringify(payload),
    signal:  AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error(`DataForSEO ${endpoint} → ${res.status}`);
  return res.json();
}

// Normalise domain string
function norm(d) {
  return String(d||"").replace(/^https?:\/\//,"").replace(/^www\./,"").split("/")[0].toLowerCase();
}

// ── Fetch all keywords a domain ranks for ─────────────────────────────────────
async function getKeywordsForDomain(domain, auth, limit = 100) {
  try {
    const data = await dfsPost(
      "dataforseo_labs/google/ranked_keywords/live",
      [{ target: domain, language_code: "en", location_name: "India", limit }],
      auth
    );
    const items = data?.tasks?.[0]?.result?.[0]?.items || [];
    return new Map(items.map(item => {
      const kd = item?.keyword_data || {};
      const ki = kd?.keyword_info || item?.keyword_info || {};
      const rse = item?.ranked_serp_element?.serp_item || item?.ranked_serp_element || {};
      const kw = kd?.keyword || item?.keyword || "";
      return [kw, {
        keyword:      kw,
        volume:       ki?.search_volume ?? kd?.search_volume ?? 0,
        difficulty:   ki?.competition ?? kd?.competition ?? 0,
        cpc:          ki?.cpc ?? 0,
        position:     rse?.rank_absolute ?? rse?.position ?? null,
        url:          rse?.url ?? null,
        intent:       ki?.search_intent ?? inferIntent(kw),
      }];
    }).filter(([k]) => k));
  } catch (err) {
    console.warn("[keyword-gap] getKeywordsForDomain failed for", domain, err?.message);
    return new Map();
  }
}

// ── Infer keyword intent from text ────────────────────────────────────────────
function inferIntent(kw) {
  const k = String(kw).toLowerCase();
  // Service/commercial intent is tested FIRST. A money keyword like "seo agency" or
  // "web design services" must map to a Service/Landing page — never a blog. (These
  // previously fell through to the informational default and were mis-typed "Blog/Guide".)
  if (/buy|price|pricing|cost|quote|cheap|discount|deal|offer|near me|hire|book|order|agency|agencies|service|services|company|companies|provider|consultant|consultancy|firm|vendor|solution|solutions|software|platform|package/.test(k)) return "transactional";
  if (/best|top|review|reviews|vs|versus|compare|comparison|alternative|alternatives/.test(k)) return "commercial";
  if (/\bin\b|\bnear\b|location|city|area|local/.test(k)) return "local";
  if (/how|what|why|when|who|guide|tutorial|learn|explain|difference|tips|ideas|examples/.test(k)) return "informational";
  return "informational";
}

// ── Opportunity score: higher volume + lower difficulty = better ──────────────
function opportunityScore(vol, diff) {
  const v = Math.max(0, Number(vol) || 0);
  const d = Math.max(1, Math.min(100, Number(diff) || 50));
  return Math.round((v / d) * 10) / 10;
}

// ── Get PAA questions from SERP for top keywords ──────────────────────────────
async function getPaaQuestions(keywords, auth) {
  if (!keywords.length) return [];
  const kws = keywords.slice(0, 3);
  const results = await Promise.allSettled(
    kws.map(kw =>
      dfsPost("serp/google/organic/live/advanced", [{
        keyword: kw, language_code: "en", location_name: "India", depth: 10, device: "desktop",
      }], auth)
    )
  );

  const questions = [];
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    const items = r.value?.tasks?.[0]?.result?.[0]?.items || [];
    for (const item of items) {
      if (item.type === "people_also_ask" && Array.isArray(item.items)) {
        for (const q of item.items) {
          if (q.title) questions.push({ question: q.title, keyword: q.seed_keyword || kws[0] });
        }
      }
    }
  }
  return questions.slice(0, 20);
}

// ── Fetch keyword suggestions for a domain (broad) ────────────────────────────
async function getKeywordSuggestions(domain, auth, limit = 100) {
  try {
    const data = await dfsPost(
      "dataforseo_labs/google/keywords_for_site/live",
      [{ target: domain, language_code: "en", location_name: "India", limit }],
      auth
    );
    const items = data?.tasks?.[0]?.result?.[0]?.items || [];
    return items.map(item => {
      const ki = item?.keyword_info || item?.keyword_data?.keyword_info || {};
      return {
        keyword:    item?.keyword || "",
        volume:     ki?.search_volume ?? 0,
        difficulty: ki?.competition ?? 0,
        cpc:        ki?.cpc ?? 0,
        intent:     inferIntent(item?.keyword || ""),
      };
    }).filter(i => i.keyword);
  } catch { return []; }
}

// ── Main keyword gap analysis ─────────────────────────────────────────────────
export async function POST(request) {
  const auth = getAuth();
  if (!auth) {
    return NextResponse.json({ error: "DataForSEO credentials not configured" }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const { domain, competitors = [], keywords = [] } = body;

  if (!domain) return NextResponse.json({ error: "domain required" }, { status: 400 });

  const target = norm(domain);
  const compDomains = competitors.map(norm).filter(Boolean).slice(0, 4);

  // 30-day persistent cache, keyed by domain + the competitor set. No-op without Mongo.
  const cacheType = `keyword-gap:${[...compDomains].sort().join("|")}`;
  const cachedGap = await getCached({ domain: target, dataType: cacheType, ttlDays: 30 });
  if (cachedGap) { await logUsage({ domain: target, api: "keyword-gap", costUSD: 0, cached: true }); return NextResponse.json(cachedGap); }

  // Fetch target keywords + all competitor keywords in parallel
  const [targetKwMap, ...compKwMaps] = await Promise.all([
    getKeywordsForDomain(target, auth, 150),
    ...compDomains.map(c => getKeywordsForDomain(c, auth, 100)),
  ]);

  // Build gap: keywords in any competitor but NOT in target
  const targetKws = new Set(targetKwMap.keys());
  const gapMap    = new Map();

  for (let i = 0; i < compDomains.length; i++) {
    const compDomain = compDomains[i];
    const compMap    = compKwMaps[i];
    for (const [kw, data] of compMap) {
      if (!targetKws.has(kw) && kw.length > 2) {
        if (!gapMap.has(kw)) {
          gapMap.set(kw, { ...data, foundIn: [], opportunity: opportunityScore(data.volume, data.difficulty) });
        }
        gapMap.get(kw).foundIn.push(compDomain);
      }
    }
  }

  // Sort gap keywords by opportunity score
  const gapKeywords = [...gapMap.values()]
    .filter(k => k.volume > 0)
    .sort((a, b) => b.opportunity - a.opportunity)
    .slice(0, 50);

  // Group by intent
  const byIntent = {};
  for (const k of gapKeywords) {
    (byIntent[k.intent] = byIntent[k.intent] || []).push(k);
  }

  // Easy wins: low difficulty, decent volume, competitor ranks top 10
  const easyWins = gapKeywords
    .filter(k => k.difficulty < 0.4 && k.volume > 100 && (k.position || 99) <= 10)
    .slice(0, 10);

  // Target's own keywords (ranked, with positions)
  const targetRanked = [...targetKwMap.values()]
    .sort((a, b) => (a.position || 999) - (b.position || 999))
    .slice(0, 30);

  // PAA questions for target's top keywords
  const topKws = keywords.length > 0 ? keywords.slice(0, 3) : targetRanked.slice(0, 3).map(k => k.keyword);
  const paaQuestions = await getPaaQuestions(topKws, auth);

  // Keyword suggestions for target domain (new opportunities from DFS)
  const suggestions = await getKeywordSuggestions(target, auth, 80);
  const newOpps = suggestions
    .filter(s => !targetKws.has(s.keyword))
    .sort((a, b) => opportunityScore(b.volume, b.difficulty) - opportunityScore(a.volume, a.difficulty))
    .slice(0, 20);

  const out = {
    domain: target,
    competitors: compDomains,
    targetKeywordCount: targetKwMap.size,
    targetRanked: targetRanked.slice(0, 20),
    gapKeywords,
    gapByIntent:  byIntent,
    easyWins,
    newOpportunities: newOpps,
    paaQuestions,
    summary: {
      totalGapKeywords: gapKeywords.length,
      totalEasyWins:    easyWins.length,
      topGapByVolume:   [...gapMap.values()].sort((a,b) => b.volume - a.volume).slice(0, 5).map(k => k.keyword),
      intentBreakdown:  Object.fromEntries(Object.entries(byIntent).map(([k,v]) => [k, v.length])),
    },
  };
  try { await putCached({ domain: target, dataType: cacheType, payload: out, source: "keyword-gap" }); } catch {}
  await logUsage({ domain: target, api: "keyword-gap", costUSD: 0.08, cached: false });
  return NextResponse.json(out);
}
