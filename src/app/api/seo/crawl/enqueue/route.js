// src/app/api/seo/crawl/enqueue/route.js
// ─────────────────────────────────────────────────────────────────────────────
// Enqueue a RENDERED crawl on the VPS worker (fast, non-blocking). The worker runs the
// full crawl and writes the result into the crawl cache the report already reads, so the
// NEXT report for this domain serves rendered data. Idempotent per domain (the store
// returns an existing queued/running job instead of piling up duplicates).
//
//   POST /api/seo/crawl/enqueue   body: { domain, keywords? }
//   → { ok, job_id, status, existing }
// ─────────────────────────────────────────────────────────────────────────────
import { enqueueCrawlJob, getCrawlJob } from "@/lib/seo/crawl/crawlJobStore";

export const runtime = "nodejs";

export async function POST(req) {
  let body = {};
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "invalid JSON body" }, { status: 400 }); }
  const domain = String(body.domain || body.source?.domain || "").trim();
  if (!domain) return Response.json({ ok: false, error: "domain required" }, { status: 400 });
  try {
    const job = await enqueueCrawlJob({ domain, keywords: body.keywords || [] });
    if (!job) return Response.json({ ok: false, error: "crawl queue unavailable (MongoDB not reachable)" }, { status: 503 });
    return Response.json({ ok: true, ...job, note: job.existing ? "a crawl for this domain is already queued/running" : "rendered crawl queued — the VPS worker will populate the cache" });
  } catch (e) {
    return Response.json({ ok: false, error: String(e?.message || e).slice(0, 200) }, { status: 500 });
  }
}

// Optional GET to poll a job's status.
export async function GET(req) {
  const id = new URL(req.url).searchParams.get("job_id");
  if (!id) return Response.json({ ok: false, error: "job_id required" }, { status: 400 });
  const job = await getCrawlJob(id);
  if (!job) return Response.json({ ok: false, error: "not found" }, { status: 404 });
  return Response.json({ ok: true, job_id: job.job_id, domain: job.domain, status: job.status, page_count: job.page_count ?? null, health_score: job.health_score ?? null, rendered_count: job.rendered_count ?? null });
}
