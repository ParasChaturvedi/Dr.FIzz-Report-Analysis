// src/lib/cache/mongo.js
// ─────────────────────────────────────────────────────────────────────────────
// 30-DAY DATA CACHE + LIFETIME AUDIT  (MongoDB, append-only)
//
// One collection `data_cache`. Every fetch (DataForSEO / Moz / Claude / LLM /
// Playwright / crawl / GMB / keywords / competitors / the final report) is stored
// as ONE document, keyed by the DOMAIN it is about. We NEVER update or delete:
//   • LIVE   = the latest document per (domain, data_type) within `ttlDays` (30).
//   • AUDIT  = every document, forever (who/when/what/where).
// After 30 days a domain's data is no longer "live" → it gets re-fetched and a NEW
// document is appended (the old one stays as history).
//
// CROSS-USER REUSE: because documents are keyed by domain, one user's competitor
// that matches an already-scanned domain reuses that domain's cached data.
//
// FAIL-SAFE: if MONGODB_URI is unset, or Mongo is unreachable, or anything throws,
// every function degrades to "no cache" → the caller fetches live exactly as before.
// The cache can NEVER break a report.
//
// Setup: set MONGODB_URI (and optional MONGODB_DB, default "drfizz") in .env.local.
// NO TTL index is created on purpose — we keep documents forever for the audit log;
// the 30-day window is enforced at read time.
// ─────────────────────────────────────────────────────────────────────────────

import { MongoClient } from "mongodb";

const DB_NAME = process.env.MONGODB_DB || "drfizz";
const COLLECTION = "data_cache";
const g = globalThis;

export function cacheConfigured() {
  return !!String(process.env.MONGODB_URI || "").trim();
}

const normDomain = (d) =>
  String(d || "").replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].toLowerCase().trim();

// Lazy, connection-reused client (survives serverless warm invocations + dev HMR).
// Circuit breaker: if a connect fails, skip Mongo for a cooldown so an unreachable
// DB never slows the report — every cache call fails fast → fail-safe no-op. Retries
// once after the cooldown. Cooldown is configurable via MONGODB_DOWN_COOLDOWN_MS.
function clientPromise() {
  const uri = String(process.env.MONGODB_URI || "").trim();
  if (!uri) return null;
  if (g.__drfizzMongoDownUntil && Date.now() < g.__drfizzMongoDownUntil) return null; // circuit open
  if (!g.__drfizzMongoPromise) {
    const cooldown = Number(process.env.MONGODB_DOWN_COOLDOWN_MS || 60000);
    const client = new MongoClient(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 5000 });
    g.__drfizzMongoPromise = client
      .connect()
      .then(async (c) => {
        // Ensure the lookup index once (idempotent). NOT a TTL index — audit is forever.
        try { await c.db(DB_NAME).collection(COLLECTION).createIndex({ domain: 1, data_type: 1, fetched_at: -1 }); } catch {}
        g.__drfizzMongoDownUntil = 0; // healthy → reset breaker
        return c;
      })
      .catch((e) => { g.__drfizzMongoPromise = null; g.__drfizzMongoDownUntil = Date.now() + cooldown; throw e; });
  }
  return g.__drfizzMongoPromise;
}

async function collection() {
  const p = clientPromise();
  if (!p) return null;
  const c = await p;
  return c.db(DB_NAME).collection(COLLECTION);
}

// Generic collection accessor (used by the usage/metrics tracker). null if no DB.
export async function getCollection(name) {
  const p = clientPromise();
  if (!p) return null;
  try { const c = await p; return c.db(DB_NAME).collection(name); }
  catch { return null; }
}

// LIVE read: latest payload for (domain, dataType) within ttlDays. null on miss/any error.
export async function getCached({ domain, dataType, ttlDays = 30 } = {}) {
  if (!cacheConfigured() || !domain || !dataType) return null;
  try {
    const col = await collection();
    if (!col) return null;
    const since = new Date(Date.now() - Number(ttlDays) * 86400000);
    const q = { domain: normDomain(domain), data_type: dataType, fetched_at: { $gte: since } };
    // Types with a degraded-payload detector look past a poisoned latest doc (written while an
    // upstream provider was failing) to the newest GOOD one; if none, it's a miss → live refetch.
    // The bad doc stays in the audit log (append-only). Other types read exactly 1 doc, as before.
    if (_hasDegradedCheck(dataType)) {
      const docs = await col.find(q).sort({ fetched_at: -1 }).limit(5).toArray();
      const good = docs.find((d) => !_isDegraded(dataType, d.payload));
      if (docs.length && !good) console.log(`[cache DEGRADED] ${dataType}:${normDomain(domain)} — ${docs.length} cached doc(s) skipped (failed-provider payload)`);
      return good ? good.payload : null;
    }
    const doc = await col.find(q).sort({ fetched_at: -1 }).limit(1).next();
    return doc ? doc.payload : null;
  } catch (e) {
    console.warn("[cache] getCached failed (serving live):", e?.message);
    return null;
  }
}

// APPEND a document (never update/delete). Returns true on write, false otherwise.
export async function putCached({ domain, dataType, payload, source = "", forClientDomain = null, fetchedBy = null } = {}) {
  if (!cacheConfigured() || !domain || !dataType || payload == null) return false;
  // Universal guard (covers direct callers, not just getOrFetch): never persist an
  // error / empty / explicitly-_partial payload — one bad fetch must not poison the TTL.
  if (!_isCacheable(payload)) return false;
  if (_isDegraded(dataType, payload)) { console.log(`[cache SKIP] ${dataType}:${normDomain(domain)} — failed-provider payload, not cached`); return false; }
  try {
    const col = await collection();
    if (!col) return false;
    await col.insertOne({
      domain: normDomain(domain),
      data_type: dataType,
      payload,
      source: source || null,
      for_client_domain: forClientDomain ? normDomain(forClientDomain) : null,
      fetched_by: fetchedBy || null,
      fetched_at: new Date(),
    });
    return true;
  } catch (e) {
    console.warn("[cache] putCached failed (data not cached, no impact):", e?.message);
    return false;
  }
}

// A payload is cacheable only if it carries real data — never persist an error object
// or an empty {}/[], so one transient upstream failure can't poison the TTL window.
// NOTE: a real "negative" answer like { found: false } IS cacheable (no .error, non-empty).
function _isCacheable(d) {
  if (d == null) return false;
  if (typeof d === "object") {
    if (d.error) return false;
    if (d._partial === true) return false;   // a degraded/incomplete fetch — don't lock it in for the TTL
    if (Array.isArray(d)) return d.length > 0;
    if (Object.keys(d).length === 0) return false;
  }
  return true;
}

// DEGRADED-PAYLOAD DETECTORS (per data_type). A payload that is non-empty but was produced while
// the upstream provider was failing (e.g. DataForSEO 402 / quota) must neither be cached nor served
// from cache — otherwise one outage poisons a domain's metrics for the full 30-day TTL (seen live:
// itzfizz.com info-stats traffic/keywords null + dataforseo 0 keywords / 0 SERP, cached 2026-10-03).
// Signatures were checked against every stored doc: only failed-provider payloads match.
const _DEGRADED = [
  // Info panel: Labs domain overview failed → both organic numbers null (a real "no data" domain is 0/0).
  { test: (t) => t === "info-stats", bad: (d) => d.organicTraffic == null && d.organicKeyword == null },
  // Full DataForSEO payload: keywords_for_site AND every SERP call failed (a real small site still
  // gets the SERP for its own domain string, so raw.serp is non-empty).
  { test: (t) => t.startsWith("dataforseo:"), bad: (d) => {
      const f = d.dataForSeo || {};
      return !(f.topKeywords || []).length && !((f.raw || {}).serp || []).length;
  } },
];
function _hasDegradedCheck(dataType) {
  const t = String(dataType || "");
  return _DEGRADED.some((x) => x.test(t));
}
function _isDegraded(dataType, d) {
  if (!d || typeof d !== "object" || Array.isArray(d)) return false;
  const t = String(dataType || "");
  try { return _DEGRADED.some((x) => x.test(t) && x.bad(d)); } catch { return false; }
}

// getOrFetch: serve a fresh cached payload, else run fetchFn() live and append it.
// Returns { data, cached }. Errors in the cache layer never block fetchFn.
export async function getOrFetch({ domain, dataType, ttlDays = 30, source = "", forClientDomain = null, fetchedBy = null, fetchFn } = {}) {
  if (typeof fetchFn !== "function") throw new Error("getOrFetch: fetchFn is required");
  if (!cacheConfigured()) return { data: await fetchFn(), cached: false }; // no DB → live, silent
  const cached = await getCached({ domain, dataType, ttlDays });
  if (cached != null) {
    console.log(`[cache HIT] ${dataType}:${normDomain(domain)} — served from ${ttlDays}-day cache (no fetch)`);
    return { data: cached, cached: true };
  }
  const data = await fetchFn();
  if (_isCacheable(data) && !_isDegraded(dataType, data)) {
    // Await the write so it completes before a serverless function freezes.
    await putCached({ domain, dataType, payload: data, source, forClientDomain, fetchedBy });
    console.log(`[cache MISS] ${dataType}:${normDomain(domain)} — fetched live + saved`);
  } else {
    // Never persist an error/empty payload — one transient upstream failure must not
    // poison this domain's report for the full TTL window.
    console.log(`[cache SKIP] ${dataType}:${normDomain(domain)} — error/empty/degraded payload, not cached`);
  }
  return { data, cached: false };
}

// Audit helper (optional): every fetch for a domain, newest first. For a future
// admin view — "kisne kab kya nikala". Returns [] on any error.
export async function getAudit({ domain, dataType = null, limit = 200 } = {}) {
  if (!cacheConfigured() || !domain) return [];
  try {
    const col = await collection();
    if (!col) return [];
    const q = { domain: normDomain(domain) };
    if (dataType) q.data_type = dataType;
    return await col
      .find(q, { projection: { payload: 0 } }) // metadata only (no heavy payloads)
      .sort({ fetched_at: -1 })
      .limit(Number(limit))
      .toArray();
  } catch (e) {
    console.warn("[cache] getAudit failed:", e?.message);
    return [];
  }
}
