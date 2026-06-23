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
  const json = await res.json();
  // DataForSEO returns HTTP 200 even when a task fails on quota exhaustion (40402/40501)
  // or other task-level errors. The per-task status_code (20000 = ok) is the real signal —
  // throw so the caller's catch treats it as a FAILURE, not as legitimately-empty data
  // (otherwise an empty result gets cached for 30 days during a quota outage).
  const tStatus = json?.tasks?.[0]?.status_code;
  if (tStatus != null && tStatus !== 20000) {
    throw new Error(`DataForSEO ${endpoint} task status ${tStatus}: ${json?.tasks?.[0]?.status_message || "task error"}`);
  }
  return json;
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

// ── Rich SERP intelligence for the priority keywords. One SERP call each (AI Overview
// enabled) yields the REAL top-10 organic results, the SERP features present (featured
// snippet owner, PAA, local pack, video, shopping), and Google's AI Overview + its cited
// sources — so every recommendation is backed by the actual SERP, not just gap aggregates.
// People-Also-Ask is derived from the SAME calls (no separate SERP spend). Cost-bounded
// to SERP_INTEL_KEYWORDS (default 15) priority keywords.
async function getSerpIntel(keywords, auth, limit = Number(process.env.SERP_INTEL_KEYWORDS || 15)) {
  const kws = [...new Set((keywords || []).map(k => String(k || "").trim().toLowerCase()).filter(k => k.length > 2))].slice(0, Math.max(1, limit));
  if (!kws.length) return { serpIntel: {}, paaQuestions: [] };
  const results = await Promise.allSettled(
    kws.map(kw => dfsPost("serp/google/organic/live/advanced", [{
      keyword: kw, language_code: "en", location_name: "India", depth: 10, device: "desktop",
      load_async_ai_overview: true, people_also_ask_click_depth: 1,
    }], auth))
  );
  const serpIntel = {};
  const paa = [];
  kws.forEach((kw, i) => {
    const r = results[i];
    if (r.status !== "fulfilled") return;
    const items = r.value?.tasks?.[0]?.result?.[0]?.items || [];
    const top_results = [];
    const features = { featured_snippet: null, has_paa: false, has_ai_overview: false, has_local_pack: false, has_video: false, has_shopping: false };
    let ai_overview = null;
    for (const it of items) {
      const t = it?.type;
      if (t === "organic" && top_results.length < 10) {
        top_results.push({ position: it.rank_absolute ?? it.rank_group ?? null, url: it.url || null, domain: it.domain || norm(it.url || ""), title: it.title || "" });
      } else if (t === "featured_snippet") {
        features.featured_snippet = it.domain || norm(it.url || "") || null;
      } else if (t === "people_also_ask") {
        features.has_paa = true;
        for (const q of (it.items || [])) if (q.title) paa.push({ question: q.title, keyword: kw });
      } else if (t === "ai_overview") {
        features.has_ai_overview = true;
        const refs = it.references || (Array.isArray(it.items) ? it.items.flatMap(x => x.references || []) : []) || [];
        const sources = [...new Set(refs.map(rf => rf.domain || norm(rf.url || "")).filter(Boolean))].slice(0, 6);
        ai_overview = { present: true, sources };
      } else if (t === "local_pack" || t === "map") { features.has_local_pack = true; }
      else if (t === "video") { features.has_video = true; }
      else if (t === "shopping" || t === "popular_products") { features.has_shopping = true; }
    }
    serpIntel[kw] = { top_results, features, ai_overview };
  });
  const seen = new Set();
  const paaQuestions = paa.filter(q => { const k = String(q.question).toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 20);
  return { serpIntel, paaQuestions };
}

// ── Real Keyword Difficulty (0-100) for a batch of keywords — one cheap DataForSEO Labs
// call (vs the ad-competition proxy we had before). Returns a keyword→KD map.
async function getBulkKeywordDifficulty(keywords, auth) {
  const kws = [...new Set((keywords || []).map(k => String(k || "").trim()).filter(Boolean))].slice(0, 1000);
  if (!kws.length) return {};
  try {
    const data = await dfsPost("dataforseo_labs/google/bulk_keyword_difficulty/live",
      [{ keywords: kws, language_code: "en", location_name: "India" }], auth);
    const items = data?.tasks?.[0]?.result?.[0]?.items || [];
    const out = {};
    for (const it of items) { const k = String(it?.keyword || "").toLowerCase(); if (k) out[k] = it?.keyword_difficulty ?? null; }
    return out;
  } catch (e) { console.warn("[keyword-gap] bulk_keyword_difficulty failed:", e?.message); return {}; }
}

// ── Competitor top pages (content gap) — derived from the competitor ranked-keyword maps
// we ALREADY fetched (zero extra cost): group each rival's ranking keywords by URL to find
// the pages driving their organic traffic, so we can reverse-engineer what content to build.
function buildCompetitorTopPages(compDomains, compKwMaps) {
  const out = [];
  for (let i = 0; i < compDomains.length; i++) {
    const pageMap = new Map();
    for (const [kw, d] of (compKwMaps[i] || new Map())) {
      const u = d?.url; if (!u) continue;
      if (!pageMap.has(u)) pageMap.set(u, { url: u, keywords: 0, volume: 0, top_keyword: "", _topVol: 0 });
      const p = pageMap.get(u);
      p.keywords++; p.volume += Number(d.volume || 0);
      if (Number(d.volume || 0) > p._topVol) { p._topVol = Number(d.volume || 0); p.top_keyword = kw; }
    }
    const pages = [...pageMap.values()].sort((a, b) => b.volume - a.volume).slice(0, 5).map(({ _topVol, ...p }) => p);
    if (pages.length) out.push({ competitor: compDomains[i], pages });
  }
  return out;
}

// ── Real backlink gap (#3 / §7) — referring domains that link to competitors but NOT to
// you, with the referring domain's authority rank. One DataForSEO Backlinks API call
// (domain_intersection, ~$0.02). Real, actionable link prospects — not generic advice.
// Requires the Backlinks API on the account; degrades to [] gracefully otherwise.
async function getBacklinkGap(target, compDomains, auth, limit = 25) {
  if (!compDomains.length) return [];
  try {
    const targets = {};
    compDomains.slice(0, 10).forEach((d, i) => { targets[String(i + 1)] = d; });
    const data = await dfsPost("backlinks/domain_intersection/live",
      [{ targets, exclude_targets: [target], limit, order_by: ["1.rank,desc"], exclude_internal_backlinks: true, include_subdomains: true }], auth);
    const items = data?.tasks?.[0]?.result?.[0]?.items || [];
    const out = [];
    for (const it of items) {
      const di = it?.domain_intersection || {};
      const keys = Object.keys(di);
      if (!keys.length) continue;
      const first = di[keys[0]] || {};
      const referring = norm(first.target || it.target || it.domain || "");
      if (!referring || referring === target) continue;
      const linksTo = keys.map(k => compDomains[Number(k) - 1]).filter(Boolean).slice(0, 3);
      out.push({ referring_domain: referring, rank: first.rank ?? null, links_to: linksTo });
    }
    return out.filter(o => o.referring_domain).slice(0, 20);
  } catch (e) { console.warn("[keyword-gap] backlink gap failed:", e?.message); return []; }
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

  // When the target AND every competitor keyword map come back empty, the most likely
  // cause is an upstream failure (e.g. DataForSEO task-level quota error now thrown by
  // dfsPost) rather than a genuine "no keywords" result. Tag the payload _partial so the
  // mongo _isCacheable guard refuses to lock an empty result in for the 30-day TTL.
  const _allMapsEmpty = targetKwMap.size === 0 && compKwMaps.every(m => m.size === 0);

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

  // Keyword suggestions for target domain (new opportunities from DFS)
  const suggestions = await getKeywordSuggestions(target, auth, 80);
  const newOpps = suggestions
    .filter(s => !targetKws.has(s.keyword))
    .sort((a, b) => opportunityScore(b.volume, b.difficulty) - opportunityScore(a.volume, a.difficulty))
    .slice(0, 20);

  // ── Rich SERP intelligence (real top-10 + SERP features + AI Overview) for the priority
  // keywords; PAA is derived from the SAME calls. Priority = user keywords + easy wins +
  // commercial-intent gap keywords, deduped + capped inside getSerpIntel.
  const priorityKws = [
    ...keywords,
    ...easyWins.map(k => k.keyword),
    ...gapKeywords.filter(k => ["transactional", "local", "commercial"].includes(k.intent)).map(k => k.keyword),
  ].filter(Boolean);
  const { serpIntel, paaQuestions } = await getSerpIntel(priorityKws, auth);

  // ── Real Keyword Difficulty (0-100) attached to the gap + new-opportunity keywords.
  const kdMap = await getBulkKeywordDifficulty([...gapKeywords, ...newOpps].map(k => k.keyword), auth);
  for (const k of [...gapKeywords, ...newOpps]) { const kd = kdMap[String(k.keyword || "").toLowerCase()]; if (kd != null) k.kd = kd; }

  // ── Competitor top pages (content gap, zero extra cost) + real backlink gap (1 call).
  const competitorTopPages = buildCompetitorTopPages(compDomains, compKwMaps);
  const backlinkGap = await getBacklinkGap(target, compDomains, auth);

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
    // #3 — real SERP intelligence per priority keyword (top-10 + features + AI Overview).
    serpIntel,
    // §5 content gap — competitor pages driving their traffic (derived, zero extra cost).
    competitorTopPages,
    // §7 — real referring-domain backlink gap (links to competitors but not you).
    backlinkGap,
    summary: {
      totalGapKeywords: gapKeywords.length,
      totalEasyWins:    easyWins.length,
      topGapByVolume:   [...gapMap.values()].sort((a,b) => b.volume - a.volume).slice(0, 5).map(k => k.keyword),
      intentBreakdown:  Object.fromEntries(Object.entries(byIntent).map(([k,v]) => [k, v.length])),
    },
    // Empty because every keyword map failed to load → degraded, do NOT cache for 30 days.
    ...(_allMapsEmpty ? { _partial: true } : {}),
  };
  try { await putCached({ domain: target, dataType: cacheType, payload: out, source: "keyword-gap" }); } catch {}
  // Cost: ranked_keywords (target + competitors) + keywords_for_site + ~15 SERP-advanced
  // (AI Overview, ~$0.004 ea) + bulk_keyword_difficulty + 1 backlink domain_intersection.
  // ~$0.18 cache-cold. Competitor top pages are derived from data already fetched (free).
  await logUsage({ domain: target, api: "keyword-gap", costUSD: 0.18, cached: false });
  return NextResponse.json(out);
}
