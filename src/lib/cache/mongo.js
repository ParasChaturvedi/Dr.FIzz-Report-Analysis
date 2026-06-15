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
function clientPromise() {
  const uri = String(process.env.MONGODB_URI || "").trim();
  if (!uri) return null;
  if (!g.__drfizzMongoPromise) {
    const client = new MongoClient(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 8000 });
    g.__drfizzMongoPromise = client
      .connect()
      .then(async (c) => {
        // Ensure the lookup index once (idempotent). NOT a TTL index — audit is forever.
        try { await c.db(DB_NAME).collection(COLLECTION).createIndex({ domain: 1, data_type: 1, fetched_at: -1 }); } catch {}
        return c;
      })
      .catch((e) => { g.__drfizzMongoPromise = null; throw e; });
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
    const doc = await col
      .find({ domain: normDomain(domain), data_type: dataType, fetched_at: { $gte: since } })
      .sort({ fetched_at: -1 })
      .limit(1)
      .next();
    return doc ? doc.payload : null;
  } catch (e) {
    console.warn("[cache] getCached failed (serving live):", e?.message);
    return null;
  }
}

// APPEND a document (never update/delete). Returns true on write, false otherwise.
export async function putCached({ domain, dataType, payload, source = "", forClientDomain = null, fetchedBy = null } = {}) {
  if (!cacheConfigured() || !domain || !dataType || payload == null) return false;
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
  if (data != null) {
    // Await the write so it completes before a serverless function freezes.
    await putCached({ domain, dataType, payload: data, source, forClientDomain, fetchedBy });
    console.log(`[cache MISS] ${dataType}:${normDomain(domain)} — fetched live + saved`);
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
