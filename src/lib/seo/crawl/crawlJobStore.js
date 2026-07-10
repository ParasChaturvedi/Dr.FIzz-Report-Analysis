// src/lib/seo/crawl/crawlJobStore.js
// ─────────────────────────────────────────────────────────────────────────────
// The MongoDB job queue for the VPS crawl worker. Vercel ENQUEUES a rendered-crawl
// job (fast, non-blocking); the worker on the VPS CLAIMS it with a lease, runs the
// full rendered crawl (no 300s cap), and writes the result into the same `data_cache`
// the report already reads. Mirrors the GEO worker's claim/lease pattern
// (geoStore.claimNextGeoJob) so the report generation flow is UNCHANGED — the worker
// only pre-populates the crawl cache with more-accurate rendered data.
// ─────────────────────────────────────────────────────────────────────────────
import { getCollection } from "@/lib/cache/mongo";

const COL = "crawl_jobs";
const now = () => new Date().toISOString();
const col = () => getCollection(COL);
const cleanDomain = (s) => String(s || "").trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/.*$/, "").toLowerCase();
const LEASE_MS = 10 * 60 * 1000;   // 10-min lease, reclaimed if a worker dies mid-job

// Idempotent: if a queued/running job for this domain already exists, return it rather
// than piling up duplicates (the cost guard, same idea as the GEO ensure route).
export async function enqueueCrawlJob({ domain, keywords = [] } = {}) {
  const c = await col(); if (!c) return null;
  const d = cleanDomain(domain); if (!d) return null;
  const existing = await c.findOne({ domain: d, status: { $in: ["queued", "running"] } });
  if (existing) return { job_id: existing.job_id, domain: d, status: existing.status, existing: true };
  const job_id = "crawl_" + (globalThis.crypto?.randomUUID?.() || (Date.now().toString(36) + Math.random().toString(36).slice(2, 8)));
  await c.insertOne({ job_id, domain: d, keywords: Array.isArray(keywords) ? keywords.slice(0, 20) : [], status: "queued", created_at: now(), lease_until: new Date(0), attempts: 0 });
  return { job_id, domain: d, status: "queued", existing: false };
}

// Atomically claim the oldest queued/running job whose lease has expired.
export async function claimNextCrawlJob() {
  try {
    const c = await col(); if (!c) return null;
    const t = Date.now();
    const res = await c.findOneAndUpdate(
      { status: { $in: ["queued", "running"] }, lease_until: { $lt: new Date(t) } },
      { $set: { status: "running", started_at: now(), lease_until: new Date(t + LEASE_MS) }, $inc: { attempts: 1 } },
      { sort: { created_at: 1 }, returnDocument: "after" }
    );
    return (res && res.value) ? res.value : (res && res._id ? res : null);   // driver-version tolerant
  } catch (e) { try { console.warn("[crawlJobStore] claim:", e?.message); } catch { /* ignore */ } return null; }
}

export async function heartbeatCrawlJob(job_id) {
  try { const c = await col(); if (c) await c.updateOne({ job_id }, { $set: { lease_until: new Date(Date.now() + LEASE_MS) } }); } catch { /* ignore */ }
}
export async function completeCrawlJob(job_id, meta = {}) {
  try { const c = await col(); if (c) await c.updateOne({ job_id }, { $set: { status: "completed", completed_at: now(), page_count: meta.pageCount ?? null, health_score: meta.healthScore ?? null, rendered_count: meta.renderedCount ?? null, crawl_engine: meta.crawlEngine || null } }); } catch { /* ignore */ }
}
export async function failCrawlJob(job_id, err) {
  try { const c = await col(); if (c) await c.updateOne({ job_id }, { $set: { status: "failed", failed_at: now(), error: String(err && err.message || err || "").slice(0, 300) } }); } catch { /* ignore */ }
}
export async function getCrawlJob(job_id) {
  try { const c = await col(); if (!c) return null; return await c.findOne({ job_id }); } catch { return null; }
}
export async function getCrawlJobByDomain(domain) {
  try { const c = await col(); if (!c) return null; return await c.findOne({ domain: cleanDomain(domain) }, { sort: { created_at: -1 } }); } catch { return null; }
}
