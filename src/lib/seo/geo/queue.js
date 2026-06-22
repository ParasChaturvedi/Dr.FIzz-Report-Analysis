// src/lib/seo/geo/queue.js
// ─────────────────────────────────────────────────────────────────────────────
// GEO Vision §17 — background JOB QUEUE (MongoDB; the infographic's "V1 queue", no Redis).
//
// 150-250 prompts × up to 6 engines CANNOT run inline within the 300s serverless limit,
// so the inline scan runs the top-N by priority and ENQUEUES the remainder here. A cron
// worker (/api/cron/geo-worker) claims the oldest job each tick, runs ONE bounded batch of
// prompts across the job's engines, appends the responses, and re-writes the geo-visibility
// cache so the report FILLS IN over time. Lease-based so two overlapping ticks never
// double-process. Idle (zero cost) when there are no jobs. Fail-safe: every function
// degrades to a no-op if Mongo is unavailable — the inline scan result is unaffected.
// ─────────────────────────────────────────────────────────────────────────────
import { getCollection, putCached } from "@/lib/cache/mongo";

const COL = "geo_jobs";
const LEASE_MS = 5 * 60 * 1000;

const normDomain = (d) =>
  String(d || "").replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].toLowerCase().trim();

// Enqueue (replacing any prior unfinished job for the domain). prompts = the FULL clustered
// set; cursor = how many were already collected inline; seedResponses = the inline responses
// (so the cumulative geo-visibility includes them from tick one). No-op if Mongo is down.
export async function enqueueGeoJob(job = {}) {
  try {
    const col = await getCollection(COL);
    if (!col) return false;
    const domain = normDomain(job.domain);
    if (!domain || !Array.isArray(job.prompts) || !job.prompts.length) return false;
    const now = new Date();
    await col.deleteMany({ domain, status: { $in: ["queued", "running"] } }); // one active job per domain
    await col.insertOne({
      domain,
      status: "queued",
      brand: job.brand || "",
      clientDomain: job.clientDomain || domain,
      competitors: job.competitors || [],
      competitorDomains: job.competitorDomains || [],
      competitorPairs: job.competitorPairs || [],
      engines: job.engines || [],
      proxyCountry: job.proxyCountry || "",
      regionLabel: job.regionLabel || "",
      industry: job.industry || "",
      location: job.location || "",
      geo_insights: job.geo_insights || null,
      prompts: job.prompts,
      cursor: Math.max(0, Number(job.cursor) || 0),
      responses: Array.isArray(job.seedResponses) ? job.seedResponses : [],
      brandSet: job.brandSet || [],
      lease_until: new Date(0),
      created_at: now,
      updated_at: now,
      error: null,
    });
    return true;
  } catch (e) { console.warn("[geo-queue] enqueue failed:", e?.message); return false; }
}

// Atomically claim the oldest processable job (queued/running with an expired lease).
export async function claimNextJob() {
  try {
    const col = await getCollection(COL);
    if (!col) return null;
    const now = new Date();
    const res = await col.findOneAndUpdate(
      { status: { $in: ["queued", "running"] }, lease_until: { $lt: now } },
      { $set: { status: "running", lease_until: new Date(now.getTime() + LEASE_MS), updated_at: now } },
      { sort: { updated_at: 1 }, returnDocument: "after" }
    );
    return (res && res.value) ? res.value : (res && res._id ? res : null); // driver-version compat
  } catch (e) { console.warn("[geo-queue] claim failed:", e?.message); return null; }
}

// Persist a processed batch: append responses, advance cursor, mark done/queued (releasing
// the lease), and re-write the geo-visibility cache with the cumulative responses.
export async function commitJobBatch({ jobId, domain, allResponses, newCursor, done, geoPayload, brand }) {
  try {
    const col = await getCollection(COL);
    if (!col) return false;
    const now = new Date();
    await col.updateOne(
      { _id: jobId },
      { $set: { responses: allResponses, cursor: newCursor, status: done ? "done" : "queued", lease_until: new Date(0), updated_at: now } }
    );
    if (geoPayload) {
      // append-only, newest-wins → the report reads the most-complete geo-visibility
      await putCached({ domain: normDomain(domain), dataType: "geo-visibility", payload: geoPayload, source: "geo-worker", fetchedBy: brand || "" });
    }
    return true;
  } catch (e) { console.warn("[geo-queue] commit failed:", e?.message); return false; }
}

export async function failJob(jobId, error) {
  try {
    const col = await getCollection(COL);
    if (!col) return;
    await col.updateOne({ _id: jobId }, { $set: { status: "error", error: String(error || "").slice(0, 300), lease_until: new Date(0), updated_at: new Date() } });
  } catch {}
}

// Progress for a domain's latest job (for a "GEO collecting… N/Total" UI hint).
export async function getGeoJobStatus(domain) {
  try {
    const col = await getCollection(COL);
    if (!col) return null;
    const doc = await col.find({ domain: normDomain(domain) }).sort({ updated_at: -1 }).limit(1).next();
    if (!doc) return null;
    return { domain: doc.domain, status: doc.status, total: doc.prompts?.length || 0, done: doc.cursor || 0, updated_at: doc.updated_at };
  } catch { return null; }
}
